const Split = require("../models/split");
const User = require("../models/user");
const redis = require("../config/redis");
const idempotencyHandler = require("../utils/idempotency");
const sagaService = require("../services/saga.service");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");

const roundMoney = (value) => Math.round(Number(value) * 100) / 100;

async function wipeTransactionDependentCaches(userId) {
    if (!userId) return;
    if (redis) {
        try {
            const analyticsKeys = await redis.keys(`analytics:*:${userId}*`);
            const transactionKeys = await redis.keys(`transactions:${userId}:*`);
            const budgetKeys = await redis.keys(`checkBudgets:${userId}:*`);
            const allKeys = [...analyticsKeys, ...transactionKeys, ...budgetKeys];
            if (allKeys.length > 0) await redis.del(...allKeys);
        } catch (err) { }
    }
}

exports.createSplit = async (req, res) => {
    try {
        const { amount, description, participants, splitType } = req.body;
        const totalAmount = roundMoney(amount);

        if (!totalAmount || totalAmount <= 0 || !description || !Array.isArray(participants) || participants.length === 0) {
            return res.status(400).json({success: false, message: "Invalid split details"});
        }

        if (!["equal", "custom", "percentage"].includes(splitType)) {
            return res.status(400).json({success: false, message: "Invalid split type"});
        }

        const currentUserId = req.user._id.toString();
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
                isRegistered: Boolean(participantUser || participantUserId)
            });
        }

        if (!seen.has(currentUserId)) {
            uniqueParticipants.unshift({
                user: req.user._id,
                email: req.user.email,
                name: req.user.name,
                requestedShare: 0,
                requestedPercentage: 0,
                isRegistered: true
            });
        }

        if (uniqueParticipants.length < 2) {
            return res.status(400).json({success: false, message: "Add at least one participant"});
        }

        let processedParticipants;

        if (splitType === "equal") {
            const splitAmount = roundMoney(totalAmount / uniqueParticipants.length);
            processedParticipants = uniqueParticipants.map(p => ({
                user: p.user,
                email: p.email,
                name: p.name,
                share: splitAmount,
                percentage: roundMoney(100 / uniqueParticipants.length),
                paid: p.user?.toString() === currentUserId,
                status: p.isRegistered ? (p.user?.toString() === currentUserId ? "paid" : "pending") : "unregistered"
            }));
        } else if (splitType === "custom") {
            const totalShares = roundMoney(uniqueParticipants.reduce((acc, curr) => acc + curr.requestedShare, 0));
            if (Math.abs(totalShares - totalAmount) > 0.01) {
                return res.status(400).json({success: false, message: "Custom shares must equal total amount"});
            }
            processedParticipants = uniqueParticipants.map(p => ({
                user: p.user,
                email: p.email,
                name: p.name,
                share: roundMoney(p.requestedShare),
                percentage: roundMoney((p.requestedShare / totalAmount) * 100),
                paid: p.user?.toString() === currentUserId,
                status: p.isRegistered ? (p.user?.toString() === currentUserId ? "paid" : "pending") : "unregistered"
            }));
        } else {
            const totalPercentage = roundMoney(uniqueParticipants.reduce((acc, curr) => acc + curr.requestedPercentage, 0));
            if (Math.abs(totalPercentage - 100) > 0.01) {
                return res.status(400).json({success: false, message: "Percentages must total 100"});
            }
            processedParticipants = uniqueParticipants.map(p => ({
                user: p.user,
                email: p.email,
                name: p.name,
                share: roundMoney((totalAmount * p.requestedPercentage) / 100),
                percentage: roundMoney(p.requestedPercentage),
                paid: p.user?.toString() === currentUserId,
                status: p.isRegistered ? (p.user?.toString() === currentUserId ? "paid" : "pending") : "unregistered"
            }));
        }

        const split = await Split.create({
            amount: totalAmount,
            paidBy: req.user._id,
            description,
            participants: processedParticipants,
            splitType,
            status: processedParticipants.every(p => p.paid || p.status === "unregistered") ? "settled" : "pending"
        });

        processedParticipants.forEach(p => wipeTransactionDependentCaches(p.user));

        for (const p of processedParticipants) {
            if (p.user && p.user.toString() !== currentUserId) {
                const notification = await Notification.create({
                    user: p.user,
                    type: "SPLIT_CREATED",
                    message: `${req.user.name || 'Someone'} added you to a split: "${description}". You owe ₹${p.share.toFixed(2)}.`
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
