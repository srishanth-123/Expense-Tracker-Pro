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

const { markNotificationChanged } = require("../utils/cacheHelpers");

// Automatically invalidate Redis cache when notifications are created or modified
notificationSchema.post("save", async function(doc) {
    await markNotificationChanged(doc.user);
});

notificationSchema.post("findOneAndUpdate", async function(doc) {
    if (doc) {
        await markNotificationChanged(doc.user);
    }
});

notificationSchema.post("updateMany", async function() {
    const filter = this.getFilter ? this.getFilter() : {};
    if (filter && filter.user) {
        await markNotificationChanged(filter.user);
    }
});

const Notification = mongoose.model("Notification", notificationSchema);
module.exports = Notification;
