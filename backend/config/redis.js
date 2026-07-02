const { Redis } = require("@upstash/redis");
const dotenv = require("dotenv");
const logger = require("../utils/logger");

dotenv.config();

let redis = null;

if (process.env.DISABLE_REDIS_CACHE === "true") {
    logger.info("Upstash Redis is disabled by environment configuration (DISABLE_REDIS_CACHE=true).");
} else {
    // ─── Optimize: Use persistent TCP ioredis client if available ────────────────
    // REST client (@upstash/redis) makes a new HTTPS request on every call (~150ms overhead).
    // TCP client (ioredis) maintains a persistent connection, dropping query times to ~2ms.
    let RedisTCP = null;
    try {
        RedisTCP = require("./ioredis");
    } catch (_) {
        RedisTCP = null;
    }

    if (RedisTCP) {
        redis = {
            async get(key) {
                const val = await RedisTCP.get(key);
                if (!val) return null;
                // Upstash REST client automatically parses JSON strings, so we match that behavior.
                try {
                    return JSON.parse(val);
                } catch (_) {
                    return val;
                }
            },
            async set(key, val, options = {}) {
                const strVal = typeof val === "string" ? val : JSON.stringify(val);
                if (options.ex) {
                    if (options.nx) {
                        return await RedisTCP.set(key, strVal, "NX", "EX", options.ex);
                    }
                    return await RedisTCP.set(key, strVal, "EX", options.ex);
                }
                return await RedisTCP.set(key, strVal);
            },
            async del(...keys) {
                if (keys.length === 0) return 0;
                return await RedisTCP.del(...keys);
            },
            async incr(key) {
                return await RedisTCP.incr(key);
            },
            async decr(key) {
                return await RedisTCP.decr(key);
            },
            pipeline() {
                return RedisTCP.pipeline();
            },
            async ping() {
                return await RedisTCP.ping();
            }
        };
        logger.info("Upstash Redis initialized (TCP Connection Wrapper)");
    } else if (process.env.REDIS_URL && process.env.REDIS_TOKEN) {
        try {
            redis = new Redis({
                url: process.env.REDIS_URL,
                token: process.env.REDIS_TOKEN,
            });
            logger.info("Upstash Redis initialized (REST Client Fallback)");
        } catch (error) {
            logger.error("Failed to initialize Upstash Redis REST:", error.message);
        }
    } else {
        logger.warn("REDIS_URL or REDIS_TOKEN is missing. Application will fallback to DB without caching.");
    }
}

module.exports = redis;
