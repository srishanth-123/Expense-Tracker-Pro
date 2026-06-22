const ioRedisConnection = require("../config/ioredis");
const logger = require("../utils/logger");
const User = require("../models/user");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");

let subscriptionCronQueue = null;
let subscriptionCronWorker = null;

if (ioRedisConnection) {
    const { Queue, Worker } = require("bullmq");

    // Queue for the daily recurring job
    subscriptionCronQueue = new Queue("subscription-cron", {
        connection: ioRedisConnection,
        defaultJobOptions: {
            attempts: 3,
            backoff: { type: "exponential", delay: 5000 },
            removeOnComplete: true,
            removeOnFail: false
        }
    });

    // Add a repeatable job to run every day at midnight (UTC)
    subscriptionCronQueue.add("daily-expiry-check", {}, {
        repeat: {
            pattern: "0 0 * * *" // Midnight UTC every day
        },
        jobId: "daily-expiry-check-job"
    });

    subscriptionCronWorker = new Worker("subscription-cron", async (job) => {
        logger.info("[BullMQ] Running daily subscription expiry check...");
        
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        // Find PRO users
        const proUsers = await User.find({ plan: "PRO", subscriptionStatus: "ACTIVE", subscriptionEndDate: { $ne: null } });
        let notificationsSent = 0;

        for (const user of proUsers) {
            // Calculate days remaining
            const end = new Date(user.subscriptionEndDate);
            const diffTime = end - startOfToday;
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            let message = null;
            if (diffDays === 7) {
                message = "Your Pro subscription expires in 7 days. Ensure your wallet has sufficient balance or renew via Razorpay to avoid interruption.";
            } else if (diffDays === 3) {
                message = "Your Pro subscription expires in 3 days. Renew now to keep access to AI Insights and FinPilot.";
            } else if (diffDays === 1) {
                message = "Your Pro subscription expires tomorrow! Renew immediately to maintain uninterrupted access.";
            }

            if (message) {
                try {
                    const notification = await Notification.create({
                        user: user._id,
                        type: "SUBSCRIPTION_ALERT",
                        message
                    });
                    sendNotificationToUser(user._id, notification);
                    notificationsSent++;
                } catch (err) {
                    logger.error(`[BullMQ] Failed to send subscription alert to ${user._id}:`, err.message);
                }
            }
            
            // Note: Auto-expiry itself is handled actively upon user login/API requests via authMiddleware,
            // but we could also run a bulk update here to clean up dormant expired users.
            if (diffDays <= 0) {
                user.plan = "FREE";
                user.subscriptionStatus = "EXPIRED";
                await user.save();
                logger.info(`[BullMQ] Auto-expired subscription for user ${user._id}`);
            }
        }

        logger.info(`[BullMQ] Daily subscription check complete. Sent ${notificationsSent} alerts.`);
        return { success: true, notificationsSent };
    }, {
        connection: ioRedisConnection
    });

    subscriptionCronWorker.on("failed", (job, err) => {
        logger.error(`[BullMQ] Subscription Cron failed:`, err.message);
    });
}

module.exports = { subscriptionCronQueue, subscriptionCronWorker };
