const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        type: {
            type: String,
            enum: [
                "WALLET_TOPUP",
                "PAYMENT_FAILED",
                "SPLIT_CREATED",
                "SPLIT_SETTLED",
                "BUDGET_WARNING",
                "SYSTEM",
                "PRO_UPGRADE",
                "WALLET_WITHDRAWAL",
                "SPLIT_SETTLEMENT_RECEIVED",
                "TRANSACTION_CREATED",
                "TRANSACTION_UPDATED",
                "TRANSACTION_DELETED",
                "TRANSACTION_RESTORED",
                "MONEY_REQUEST",
                "MONEY_REQUEST_ACCEPTED",
                "MONEY_REQUEST_REJECTED",
                "P2P_TRANSFER_SENT",
                "P2P_TRANSFER_RECEIVED",
                "SUBSCRIPTION_ALERT",
                "SAVINGS_GOAL_COMPLETE",
                "RECURRING_TRANSACTION"
            ],
            required: true,
        },
        message: {
            type: String,
            required: true,
        },
        read: {
            type: Boolean,
            default: false,
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        }
    },
    { timestamps: true }
);

// Index for faster queries filtering by user and sorting by date
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, read: 1 });

const redis = require("../config/redis");

// Automatically invalidate Redis cache when notifications are created or modified
notificationSchema.post("save", async function(doc) {
    if (redis) {
        try {
            const keys = await redis.keys(`notifications:${doc.user}:*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (err) {
            console.error("Failed to clear notification cache on save:", err.message);
        }
    }
});

notificationSchema.post("findOneAndUpdate", async function(doc) {
    if (doc && redis) {
        try {
            const keys = await redis.keys(`notifications:${doc.user}:*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (err) {
            console.error("Failed to clear notification cache on findOneAndUpdate:", err.message);
        }
    }
});

notificationSchema.post("updateMany", async function() {
    if (redis) {
        try {
            const keys = await redis.keys("notifications:*");
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (err) {
            console.error("Failed to clear notification cache on updateMany:", err.message);
        }
    }
});

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
