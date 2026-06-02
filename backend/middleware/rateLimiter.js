/**
 * Distributed Rate Limiter (Upstash Redis)
 * ----------------------------------------
 * Implements a custom Store for `express-rate-limit` v7 backed by the existing
 * Upstash REST Redis client. Because `@upstash/redis` is a REST client (not
 * ioredis-compatible), the popular `rate-limit-redis` adapter cannot be used
 * directly. We instead implement the minimal Store interface using `INCR` +
 * `PEXPIRE` (atomic via pipeline). This persists counters across server
 * restarts and works correctly across multiple horizontally-scaled instances.
 *
 * Fallback: if Redis is unavailable, limiters silently fall back to the
 * default in-memory store (per-instance only) so the API stays online.
 */

const rateLimit = require("express-rate-limit");
const redis = require("../config/redis");

const tooManyRequestsResponse = {
    success: false,
    message: "Too many requests, please try again later",
};

/**
 * UpstashRedisStore — minimal implementation of the express-rate-limit Store
 * interface (v7). See https://express-rate-limit.mintlify.app/reference/stores
 */
class UpstashRedisStore {
    constructor({ prefix = "rl:", windowMs }) {
        this.prefix = prefix;
        this.windowMs = windowMs;
    }

    // Called by express-rate-limit once when the limiter is initialised.
    // If options.windowMs was not provided at construction time, capture it here.
    init(options) {
        if (!this.windowMs && options && options.windowMs) {
            this.windowMs = options.windowMs;
        }
    }

    _key(key) {
        return `${this.prefix}${key}`;
    }

    /**
     * Atomically increments the counter and (only on first hit) sets the TTL.
     * Returns { totalHits, resetTime }.
     */
    async increment(key) {
        const redisKey = this._key(key);
        try {
            // Pipeline = single round-trip to Upstash
            const pipeline = redis.pipeline();
            pipeline.incr(redisKey);
            pipeline.pexpire(redisKey, this.windowMs, "NX"); // set TTL only if missing
            pipeline.pttl(redisKey);
            const results = await pipeline.exec();

            // Upstash pipeline returns an array of raw results
            const totalHits = Number(results[0]);
            const pttl = Number(results[2]);

            const resetTime = pttl > 0
                ? new Date(Date.now() + pttl)
                : new Date(Date.now() + this.windowMs);

            return { totalHits, resetTime };
        } catch (err) {
            // Graceful degradation: if Redis fails, allow the request through
            // (treat as 1 hit) so the API never goes down with Redis.
            console.warn("[RateLimiter] Redis increment failed, allowing request:", err.message);
            return { totalHits: 1, resetTime: new Date(Date.now() + this.windowMs) };
        }
    }

    async decrement(key) {
        try {
            await redis.decr(this._key(key));
        } catch (err) {
            console.warn("[RateLimiter] Redis decrement failed:", err.message);
        }
    }

    async resetKey(key) {
        try {
            await redis.del(this._key(key));
        } catch (err) {
            console.warn("[RateLimiter] Redis resetKey failed:", err.message);
        }
    }
}

/**
 * Factory that builds a limiter. Uses UpstashRedisStore when Redis is
 * available, otherwise falls back to the built-in MemoryStore.
 */
const buildLimiter = ({ windowMs, max, prefix }) => {
    const options = {
        windowMs,
        max,
        message: tooManyRequestsResponse,
        standardHeaders: true,
        legacyHeaders: false,
        // Custom 429 JSON response
        handler: (req, res) => {
            res.status(429).json(tooManyRequestsResponse);
        },
    };

    if (redis) {
        options.store = new UpstashRedisStore({ prefix, windowMs });
    }

    return rateLimit(options);
};

// ─── Route-specific limiters ─────────────────────────────────────────────────
const authLimiter = buildLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 50, // 50 requests per minute
    prefix: "rl:auth:",
});

const paymentLimiter = buildLimiter({
    windowMs: 15 * 60 * 1000,
    max: 50,
    prefix: "rl:payment:",
});

const walletLimiter = buildLimiter({
    windowMs: 15 * 60 * 1000,
    max: 100,
    prefix: "rl:wallet:",
});

const generalLimiter = buildLimiter({
    windowMs: 1 * 60 * 1000, // 1 minute window
    max: 500, // 500 requests per minute
    prefix: "rl:general:",
});

module.exports = {
    authLimiter,
    paymentLimiter,
    walletLimiter,
    generalLimiter,
    UpstashRedisStore,
};
