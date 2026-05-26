const Split = require("../models/split");
const User = require("../models/user");
const redis = require("../config/redis");
const idempotencyHandler = require("../utils/idempotency");
const sagaService = require("../services/saga.service");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");

async function wipeTransactionDependentCaches(userId) {
    if (redis) {
        try {
            const analyticsKeys = await redis.keys(`analytics:*:${userId}`);
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

        let processedParticipants = [];

        if (splitType === "equal") {
            const splitAmount = amount / participants.length;
            processedParticipants = participants.map(p => ({
                user: p.user,
                share: splitAmount,
                paid: p.user.toString() === req.user._id.toString()
            }));
        } else if (splitType === "custom") {
            const totalShares = participants.reduce((acc, curr) => acc + curr.share, 0);
            if (totalShares !== amount) {
                return res.status(400).json({success: false, message: "Invalid request data"});
            }
            processedParticipants = participants.map(p => ({
                user: p.user,
                share: p.share,
                paid: p.user.toString() === req.user._id.toString()
            }));
        } else {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        const split = await Split.create({
            amount,
            paidBy: req.user._id,
            description,
            participants: processedParticipants,
            splitType
        });

        // Wiping caches for all participants
        processedParticipants.forEach(p => wipeTransactionDependentCaches(p.user));

        // Send notifications to all participants (except the creator)
        for (const p of processedParticipants) {
            if (p.user.toString() !== req.user._id.toString()) {
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
        if (!split) return res.status(404).json({success: false, message: "Resource not found"});

        const participantIndex = split.participants.findIndex(p => p.user.toString() === req.user._id.toString());

        if (participantIndex === -1) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        if (split.participants[participantIndex].paid) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        const shareAmount = split.participants[participantIndex].share;

        // Wrap the core physical mutation inside an Idempotent block mapping to Saga Flow
        const triggerPipeline = async () => {

            // Orchestrate Distributed Saga Protocol
            await sagaService.runSplitSettlementSaga(
                req.user._id,
                split.paidBy,
                splitId,
                shareAmount,
                participantIndex
            );

            // Dynamically wipe caching architectures implicitly
            wipeTransactionDependentCaches(req.user._id);
            wipeTransactionDependentCaches(split.paidBy);

            return { message: "Split securely settled via fault-tolerant Saga pipeline", splitId };
        };

        const result = await idempotencyHandler.checkOrExecute(idempotencyKey, triggerPipeline);

        res.json({success: true, message: "Success", data: result});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};
