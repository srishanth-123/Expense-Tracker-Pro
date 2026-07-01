const redis = require("../../config/redis");
const logger = require("../logger");

const STATE_TTL = 600; // 10 minutes
const localMemoryStore = new Map();

/**
 * Get active Redis key for user session.
 */
function getRedisKey(userId, conversationId) {
    return `chat:session:${userId}:${conversationId}`;
}

/**
 * Retrieve session state from Redis.
 */
async function getState(userId, conversationId) {
    if (!redis) {
        const key = getRedisKey(userId, conversationId);
        const data = localMemoryStore.get(key);
        if (!data) return null;
        if (new Date(data.expiresAt) < new Date()) {
            localMemoryStore.delete(key);
            return null;
        }
        return data.state;
    }
    try {
        const key = getRedisKey(userId, conversationId);
        const raw = await redis.get(key);
        if (!raw) return null;

        if (typeof raw === "object") return raw;
        if (typeof raw === "string") return JSON.parse(raw);

        logger.warn(`[redisMemory] Unexpected state type: ${typeof raw}`);
        await redis.del(key);
        return null;
    } catch (err) {
        logger.error(`[redisMemory] getState error: ${err.message}`);
        return null;
    }
}

/**
 * Write session state to Redis.
 */
async function setState(userId, conversationId, state) {
    if (!redis) {
        const key = getRedisKey(userId, conversationId);
        const expiresAt = new Date(Date.now() + STATE_TTL * 1000).toISOString();
        localMemoryStore.set(key, { state, expiresAt });
        return;
    }
    try {
        const key = getRedisKey(userId, conversationId);
        const stateWithTimestamp = {
            ...state,
            updatedAt: new Date().toISOString()
        };
        await redis.set(key, JSON.stringify(stateWithTimestamp), { ex: STATE_TTL });
    } catch (err) {
        logger.error(`[redisMemory] setState error: ${err.message}`);
    }
}

/**
 * Delete session state from Redis.
 */
async function clearState(userId, conversationId) {
    if (!redis) {
        const key = getRedisKey(userId, conversationId);
        localMemoryStore.delete(key);
        return;
    }
    try {
        const key = getRedisKey(userId, conversationId);
        await redis.del(key);
    } catch (err) {
        logger.error(`[redisMemory] clearState error: ${err.message}`);
    }
}

module.exports = {
    getState,
    setState,
    clearState
};
