/**
 * BullMQ — AI Insights Background Queue
 * ----------------------------------------
 * Offloads the expensive AI insight generation (6 MongoDB aggregations +
 * Gemini API call) to a background worker so the Express thread responds
 * immediately.
 *
 * Flow:
 *   1. Controller enqueues { userId } → returns 202 "processing"
 *   2. Worker picks up the job:
 *        a. Calls aiInsightsService.generateInsights(userId)
 *        b. Caches the result in Upstash Redis (6h TTL)
 *        c. Emits 'insights_ready' to the user via Socket.io
 *   3. Frontend receives socket event → refetches from cache (instant)
 *
 * Graceful fallback: If ioredis is not configured, the queue and worker
 * export as null, and the controller falls back to synchronous execution.
 */

const ioRedisConnection = require("../config/ioredis");
const logger = require("../utils/logger");

let insightsQueue = null;
let insightsWorker = null;

if (ioRedisConnection) {
    const { Queue, Worker } = require("bullmq");

    // ─── Queue ───────────────────────────────────────────────────────────────
    insightsQueue = new Queue("ai-insights", {
        connection: ioRedisConnection,
        defaultJobOptions: {
            attempts: 2,
            backoff: { type: "exponential", delay: 3000 },
            removeOnComplete: { count: 100 },  // Keep last 100 completed
            removeOnFail: { count: 50 },       // Keep last 50 failed
        },
    });

    // ─── Worker ──────────────────────────────────────────────────────────────
    insightsWorker = new Worker(
        "ai-insights",
        async (job) => {
            const { userId } = job.data;
            logger.info(`[BullMQ] Processing AI insights for user ${userId}`);

            // Lazy-load services to avoid circular dependency issues at startup
            const aiInsightsService = require("../services/aiInsightsService");
            const redis = require("../config/redis");
            const { sendNotificationToUser } = require("../utils/socket");

            const result = await aiInsightsService.generateInsights(userId);

            // Cache in Upstash Redis (same key the controller uses)
            const cacheKey = `analytics:aiInsights:${userId}`;
            if (redis) {
                try {
                    await redis.set(cacheKey, result, { ex: 60 * 60 * 6 }); // 6h TTL
                } catch (err) {
                    logger.warn("[BullMQ] Failed to cache insights:", err.message);
                }
            }

            // Notify the user via Socket.io that insights are ready
            sendNotificationToUser(userId, {
                type: "insights_ready",
                message: "Your AI financial insights are ready!",
                data: result,
            });

            logger.info(`[BullMQ] AI insights completed for user ${userId} (source: ${result.source})`);
            return { source: result.source, insightCount: result.insights?.length || 0 };
        },
        {
            connection: ioRedisConnection,
            concurrency: 3,          // Process up to 3 jobs at a time
            limiter: {
                max: 10,              // Max 10 jobs per minute (Gemini rate limits)
                duration: 60000,
            },
        }
    );

    insightsWorker.on("completed", (job, result) => {
        logger.info(`[BullMQ] Job ${job.id} completed:`, result);
    });

    insightsWorker.on("failed", (job, err) => {
        logger.error(`[BullMQ] Job ${job?.id} failed:`, err.message);
    });

    logger.info("[BullMQ] AI insights queue and worker initialized");
}

module.exports = { insightsQueue, insightsWorker };
