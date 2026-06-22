const redis = require("../config/redis");
const logger = require("./logger");

/**
 * Increments the financial data version for a user.
 * This acts as a dirty flag so ALL analytics endpoints know when to regenerate
 * instead of generating on every single page load.
 */
const markFinancialDataChanged = async (userId) => {
    if (!redis) return;
    try {
        await redis.incr(`financial-version:${userId}`);
    } catch (err) {
        logger.warn(`[Cache] Error incrementing financial version for ${userId}: ${err.message}`);
    }
};

/**
 * Returns the current financial data version for a user.
 */
const getFinancialVersion = async (userId) => {
    if (!redis) return 1;
    try {
        const fv = await redis.get(`financial-version:${userId}`);
        return fv ? parseInt(fv, 10) : 1;
    } catch (err) {
        logger.warn(`[Cache] Error reading financial version for ${userId}: ${err.message}`);
        return 1;
    }
};

/**
 * Standard cache TTL in seconds — 24 hours.
 * Staleness is handled by version checking, not TTL expiry.
 * The TTL is just a safety net to avoid orphaned keys.
 */
const CACHE_TTL = 60 * 60 * 24; // 24h

/**
 * AI insights cache TTL — 24 hours (version-gated).
 */
const AI_INSIGHTS_TTL = 60 * 60 * 24;

/**
 * Read-through cache helper with financial-version validation.
 *
 * How it works:
 *   1. GET cached value (1 Redis command)
 *   2. If cached value exists AND its `_fv` matches current financial version → return cached (0 more commands)
 *   3. Otherwise, call computeFn, store result with `_fv` tag, return fresh data (1 SET command)
 *
 * This means:
 *   - Cache HIT (no data changes): 1 Redis command (GET only, version is embedded in the value)
 *   - Cache MISS or stale version: 2 Redis commands (GET + SET)
 *
 * @param {string} cacheKey - Redis key
 * @param {number} financialVersion - Current version of user's financial data
 * @param {Function} computeFn - Async function that returns the data to cache
 * @param {number} [ttl=CACHE_TTL] - TTL in seconds
 * @returns {Object} { data, cached: boolean }
 */
const versionedCacheGet = async (cacheKey, financialVersion, computeFn, ttl = CACHE_TTL) => {
    if (redis) {
        try {
            const cached = await redis.get(cacheKey);
            if (cached) {
                let parsed;
                if (typeof cached === "string") {
                    parsed = JSON.parse(cached);
                } else if (typeof cached === "object") {
                    parsed = cached;
                }

                // Version check: if cached version matches, return immediately
                if (parsed && parsed._fv >= financialVersion) {
                    // Strip internal metadata before returning
                    const { _fv, ...data } = parsed;
                    return { data, cached: true };
                }
            }
        } catch (err) {
            logger.warn(`[Cache] GET error for ${cacheKey}: ${err.message}`);
        }
    }

    // Cache miss or stale — compute fresh data
    const data = await computeFn();

    // Store with version tag
    if (redis) {
        try {
            const toStore = { ...data, _fv: financialVersion };
            await redis.set(cacheKey, JSON.stringify(toStore), { ex: ttl });
        } catch (err) {
            logger.warn(`[Cache] SET error for ${cacheKey}: ${err.message}`);
        }
    }

    return { data, cached: false };
};

/**
 * Deterministic cache invalidation — deletes known analytics keys for a user
 * WITHOUT using redis.keys() (which is O(N) across the entire keyspace).
 *
 * Instead of scanning with patterns like `analytics:*:userId*`, we delete
 * a fixed list of known cache keys. This uses a single DEL command with
 * all keys, which is O(K) where K = number of keys to delete.
 */
const wipeUserAnalyticsCache = async (userId) => {
    if (!redis) return;
    try {
        const keysToDelete = [
            `analytics:summary:${userId}:::::`,
            `analytics:categoryBreakdown:${userId}::`,
            `analytics:topExpenses:${userId}`,
            `analytics:categoryTrend:${userId}`,
            `analytics:smartInsights:${userId}`,
            `analytics:dailyHeatmap:${userId}`,
            `analytics:spendingPrediction:${userId}`,
            `analytics:incomeExpenseTrend:${userId}`,
            `analytics:financialHealth:${userId}`,
            `ai-insights:${userId}`,
        ];
        // Silently delete — keys that don't exist are ignored by DEL
        await redis.del(...keysToDelete);
    } catch (err) {
        logger.warn(`[Cache] Error wiping analytics cache for ${userId}: ${err.message}`);
    }
};

module.exports = {
    markFinancialDataChanged,
    getFinancialVersion,
    versionedCacheGet,
    wipeUserAnalyticsCache,
    CACHE_TTL,
    AI_INSIGHTS_TTL,
};
