const Split = require("../models/split");
const User = require("../models/user");
const redis = require("../config/redis");
const idempotencyHandler = require("../utils/idempotency");
const sagaService = require("../services/saga.service");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");
const Transaction = require("../models/Transaction");
const Category = require("../models/category");
const budgetService = require("../services/budgetService");
const { invalidateUserSearchCache } = require("../utils/lruCache");
const { markFinancialDataChanged } = require("../utils/cacheHelpers");

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

async function wipeTransactionDependentCaches(userId) {
    if (!userId) return;
    await markFinancialDataChanged(userId);
    if (redis) {
        try {
            await redis.del(`transactions:${userId}:list`);
        } catch (err) { }
    }
}

exports.createSplit = async (req, res) => {
    try {
        const { amount, description, participants, splitType, category, paidBy } = req.body;
        const totalAmount = roundMoney(amount);

        if (!totalAmount || totalAmount <= 0 || !description || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({success: false, message: "Invalid split details"});
        }

        if (!["equal", "custom", "percentage"].includes(splitType)) {
            return res.status(400).json({success: false, message: "Invalid split type"});
        }

        const currentUserId = req.user._id.toString();
        const payerUserId = (paidBy || req.user._id).toString();
        const uniqueParticipants = [];
        const seen = new Set();

        for (const participant of participants) {
            const participantUserId = participant.user?.toString();
            const participantEmail = participant.email?.toLowerCase()?.trim();
            const participantKey = participantUserId || participantEmail;

            if (!participantKey || seen.has(participantKey)) continue;
            seen.add(participantKey);

            let participantUser = null;
            if (participantUserId) {
                participantUser = await User.findById(participantUserId).select("name email");
            } else if (participantEmail) {
                participantUser = await User.findOne({ email: participantEmail }).select("name email");
            }

            uniqueParticipants.push({
                user: participantUser?._id || (participantUserId || null),
                email: participantUser?.email || participantEmail,
                name: participantUser?.name || participant.name || participantEmail || "Pending participant",
                requestedShare: Number(participant.share) || 0,
                requestedPercentage: Number(participant.percentage) || 0,
                isRegistered: Boolean(participantUser || participantUserId),
                paid: participant.paid
            });
        }

        if (!seen.has(currentUserId)) {
            uniqueParticipants.unshift({
                user: req.user._id,
                email: req.user.email,
                name: req.user.name,
                requestedShare: 0,
                requestedPercentage: 0,
                isRegistered: true,
                paid: false
            });
        }

        if (uniqueParticipants.length < 2) {
            return res.status(400).json({success: false, message: "Add at least one participant"});
        }

        const mapProcessedParticipant = (p, share, percentage) => {
            const isPayer = p.user?.toString() === payerUserId;
            const isParticipantPaid = isPayer || Boolean(p.paid);
            return {
                user: p.user,
                email: p.email,
                name: p.name,
                share,
                percentage,
                paid: isParticipantPaid,
                status: p.isRegistered ? (isParticipantPaid ? "paid" : "pending") : (isParticipantPaid ? "paid" : "unregistered")
            };
        };

        let processedParticipants;

        if (splitType === "equal") {
            const splitAmount = roundMoney(totalAmount / uniqueParticipants.length);
            processedParticipants = uniqueParticipants.map(p => 
                mapProcessedParticipant(p, splitAmount, roundMoney(100 / uniqueParticipants.length))
            );
        } else if (splitType === "custom") {
            const totalShares = roundMoney(uniqueParticipants.reduce((acc, curr) => acc + curr.requestedShare, 0));
            if (Math.abs(totalShares - totalAmount) > 0.01) {
                return res.status(400).json({success: false, message: "Custom shares must equal total amount"});
            }
            processedParticipants = uniqueParticipants.map(p => 
                mapProcessedParticipant(p, roundMoney(p.requestedShare), roundMoney((p.requestedShare / totalAmount) * 100))
            );
        } else {
            const totalPercentage = roundMoney(uniqueParticipants.reduce((acc, curr) => acc + curr.requestedPercentage, 0));
            if (Math.abs(totalPercentage - 100) > 0.01) {
                return res.status(400).json({success: false, message: "Percentages must total 100"});
            }
            processedParticipants = uniqueParticipants.map(p => 
                mapProcessedParticipant(p, roundMoney((totalAmount * p.requestedPercentage) / 100), roundMoney(p.requestedPercentage))
            );
        }

        const split = await Split.create({
            amount: totalAmount,
            paidBy: payerUserId,
            category: category || null,
            description,
            participants: processedParticipants,
            splitType,
            status: processedParticipants.every(p => p.paid || p.status === "unregistered") ? "settled" : "pending"
        });

        // Load the source category name for mapping
        let sourceCategory = null;
        if (category) {
            sourceCategory = await Category.findById(category);
        }
        const categoryName = sourceCategory ? sourceCategory.name : "Split";

        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        for (const p of processedParticipants) {
            // Automatically log a standard Transaction (type: expense) for all registered participants who are paid
            if (p.paid && p.user && p.share > 0) {
                try {
                    let participantCategory = await Category.findOne({
                        user: p.user,
                        name: { $regex: new RegExp(`^${escapeRegex(categoryName)}$`, "i") }
                    });

                    if (participantCategory) {
                        if (participantCategory.isDeleted) {
                            participantCategory.isDeleted = false;
                            participantCategory.deletedAt = null;
                            await participantCategory.save();
                        }
                    } else {
                        participantCategory = await Category.create({
                            user: p.user,
                            name: categoryName
                        });
                    }

                    await Transaction.create({
                        user: p.user,
                        type: "expense",
                        amount: p.share,
                        category: participantCategory._id,
                        description: `Split share: ${description}`,
                        date: new Date()
                    });

                    await budgetService.syncBudgetForTransaction(p.user, participantCategory._id, new Date());
                    invalidateUserSearchCache(p.user);
                } catch (txErr) {
                    console.error(`Failed to create transaction for participant ${p.user}:`, txErr);
                }
            }
        }

        processedParticipants.forEach(p => wipeTransactionDependentCaches(p.user));

        for (const p of processedParticipants) {
            if (p.user && p.user.toString() !== currentUserId) {
                const msg = p.paid 
                    ? `${req.user.name || 'Someone'} added you to a split: "${description}". Your share of ₹${p.share.toFixed(2)} was marked settled upfront.`
                    : `${req.user.name || 'Someone'} added you to a split: "${description}". You owe ₹${p.share.toFixed(2)}.`;
                const notification = await Notification.create({
                    user: p.user,
                    type: "SPLIT_CREATED",
                    message: msg
                });
                sendNotificationToUser(p.user, notification);
            }
        }

        res.status(201).json(split);
    } catch (error) {
        console.error("Create split error:", error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.getUserSplits = async (req, res) => {
    try {
        const splits = await Split.find({ "participants.user": req.user._id })
            .populate("paidBy", "name email")
            .populate("participants.user", "name email")
            .populate("category")
            .sort({ createdAt: -1 });

        res.json({success: true, message: "Success", data: splits});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.settleSplit = async (req, res) => {
    try {
        const { splitId } = req.body;
        const idempotencyKey = req.headers["x-idempotency-key"] || req.body.idempotencyKey;

        const split = await Split.findById(splitId);
        if (!split) return res.status(404).json({success: false, message: "Split not found"});

        const participantIndex = split.participants.findIndex(p => p.user && p.user.toString() === req.user._id.toString());

        if (participantIndex === -1) {
            return res.status(400).json({success: false, message: "You are not a participant in this split"});
        }

        if (split.participants[participantIndex].paid) {
            return res.status(400).json({success: false, message: "This split is already settled"});
        }

        if (split.participants[participantIndex].status === "unregistered") {
            return res.status(400).json({success: false, message: "Cannot settle for unregistered participants"});
        }

        const shareAmount = split.participants[participantIndex].share;

        const triggerPipeline = async () => {
            await sagaService.runSplitSettlementSaga(
                req.user._id,
                split.paidBy,
                splitId,
                shareAmount,
                participantIndex
            );

            wipeTransactionDependentCaches(req.user._id);
            wipeTransactionDependentCaches(split.paidBy);

            const receiver = await User.findById(split.paidBy).select("name");

            return { 
                message: "Split settled successfully", 
                splitId,
                receiverName: receiver ? receiver.name : "Receiver"
            };
        };

        const result = await idempotencyHandler.checkOrExecute(idempotencyKey, triggerPipeline);

        res.json({success: true, message: "Success", data: result});
    } catch (error) {
        console.error("Settle split error:", error);
        if (error.message.includes("Insufficient wallet balance")) {
            return res.status(400).json({success: false, message: "Insufficient wallet balance to settle this split"});
        }
        if (error.message.includes("Split already settled")) {
            return res.status(400).json({success: false, message: "This split is already settled"});
        }
        res.status(500).json({success: false, message: "Server error during settlement"});
    }
};

exports.settleOffline = async (req, res) => {
    try {
        const { splitId, participantUserId, email } = req.body;

        const split = await Split.findById(splitId);
        if (!split) {
            return res.status(404).json({ success: false, message: "Split not found" });
        }

        // Only the payer of the split can mark it as settled offline
        if (split.paidBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Only the split payer can settle offline" });
        }

        let participantIndex = -1;
        if (participantUserId) {
            participantIndex = split.participants.findIndex(
                p => p.user && p.user.toString() === participantUserId.toString()
            );
        } else if (email) {
            participantIndex = split.participants.findIndex(
                p => p.email && p.email.toLowerCase() === email.toLowerCase()
            );
        }

        if (participantIndex === -1) {
            return res.status(400).json({ success: false, message: "Participant not found in this split" });
        }

        const participant = split.participants[participantIndex];

        if (participant.paid) {
            return res.status(400).json({ success: false, message: "Participant share is already settled" });
        }

        // Mark as paid
        participant.paid = true;
        participant.status = "paid";

        // Check if all participants are paid
        split.status = split.participants.every(p => p.paid || p.status === "unregistered") ? "settled" : "pending";

        await split.save();

        if (participant.user) {
            // Automatically log standard Transaction (expense) for the settled participant
            let sourceCategory = null;
            if (split.category) {
                sourceCategory = await Category.findById(split.category);
            }
            const categoryName = sourceCategory ? sourceCategory.name : "Split";

            const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            let participantCategory = await Category.findOne({
                user: participant.user,
                name: { $regex: new RegExp(`^${escapeRegex(categoryName)}$`, "i") }
            });

            if (participantCategory) {
                if (participantCategory.isDeleted) {
                    participantCategory.isDeleted = false;
                    participantCategory.deletedAt = null;
                    await participantCategory.save();
                }
            } else {
                participantCategory = await Category.create({
                    user: participant.user,
                    name: categoryName
                });
            }

            await Transaction.create({
                user: participant.user,
                type: "expense",
                amount: participant.share,
                category: participantCategory._id,
                description: `Split share (offline): ${split.description}`,
                date: new Date()
            });

            // Sync budget and invalidate cache for participant
            await budgetService.syncBudgetForTransaction(participant.user, participantCategory._id, new Date());
            invalidateUserSearchCache(participant.user);
            await wipeTransactionDependentCaches(participant.user);
        }

        await wipeTransactionDependentCaches(split.paidBy);

        // Notify participant
        if (participant.user) {
            try {
                const notification = await Notification.create({
                    user: participant.user,
                    type: "SPLIT_SETTLED_OFFLINE",
                    message: `Your share of ₹${participant.share.toFixed(2)} for "${split.description}" was marked settled offline by ${req.user.name}.`
                });
                sendNotificationToUser(participant.user, notification);
            } catch (_) {}
        }

        res.json({ success: true, message: "Participant share marked settled offline", data: split });
    } catch (error) {
        console.error("Settle offline error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.deleteSplit = async (req, res) => {
    try {
        const { id } = req.params;
        const split = await Split.findById(id);

        if (!split) {
            return res.status(404).json({ success: false, message: "Split not found" });
        }

        // Only the creator (paidBy) can delete the split
        if (split.paidBy.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "You are not authorized to delete this split" });
        }

        await Split.findByIdAndDelete(id);

        // Wipe transaction caches for all participants so their dashboards/views refresh
        if (split.participants && split.participants.length > 0) {
            split.participants.forEach(p => {
                if (p.user) wipeTransactionDependentCaches(p.user);
            });
        }
        wipeTransactionDependentCaches(req.user._id);

        res.json({ success: true, message: "Split deleted successfully" });
    } catch (error) {
        console.error("Delete split error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
