/**
 * IORedis TCP Connection (Shared)
 * --------------------------------
 * Standard TCP Redis connection using `ioredis`. Required by:
 *   - BullMQ (background job queue)
 *   - @socket.io/redis-adapter (multi-node broadcasting)
 *
 * Uses `REDIS_IOREDIS_URL` from .env (the `rediss://` URL from Upstash).
 * Falls back gracefully to null if the env var is missing, allowing the
 * app to run in single-node mode without BullMQ or socket adapter.
 */

const Redis = require("ioredis");
const logger = require("../utils/logger");

let ioRedisConnection = null;

if (process.env.REDIS_IOREDIS_URL) {
    try {
        ioRedisConnection = new Redis(process.env.REDIS_IOREDIS_URL, {
            maxRetriesPerRequest: null,   // Required by BullMQ
            enableReadyCheck: false,      // Upstash doesn't support INFO command
            tls: {
                rejectUnauthorized: false // Upstash uses self-signed TLS
            },
            retryStrategy(times) {
                const delay = Math.min(times * 200, 5000);
                logger.warn(`[IORedis] Reconnecting in ${delay}ms (attempt ${times})`);
                return delay;
            }
        });

        ioRedisConnection.on("connect", () => {
            logger.info("[IORedis] TCP connection established (Upstash)");
        });

        ioRedisConnection.on("error", (err) => {
            logger.error("[IORedis] Connection error:", err.message);
        });
    } catch (error) {
        logger.error("[IORedis] Failed to initialize:", error.message);
        ioRedisConnection = null;
    }
} else {
    console.warn(
        "[IORedis] REDIS_IOREDIS_URL is missing. BullMQ and Socket adapter will be disabled."
    );
}

module.exports = ioRedisConnection;
