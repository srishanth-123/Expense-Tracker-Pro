const redis = require("../config/redis");

class IdempotencyHandler {
    constructor() {
        this.prefix = "idemp";
        this.ttl = 86400; // Track key for 24 hours globally
    }

    async checkOrExecute(idempotencyKey, executeLogic) {
        if (!idempotencyKey) {
            console.warn("[Idempotency] No explicit key provided, executing logic functionally.");
            return await executeLogic();
        }

        if (!redis) {
            console.warn("[Idempotency] Redis inactive. Proceeding dynamically.");
            return await executeLogic();
        }

        const redisKey = `${this.prefix}:${idempotencyKey}`;

        try {
            // Obtain lock immediately natively
            const isLocked = await redis.set(redisKey, JSON.stringify({ status: "PROCESSING" }), { nx: true, ex: this.ttl });
            
            if (!isLocked) {
                // Return cached or duplicate lock
                const savedStateString = await redis.get(redisKey);
                if (savedStateString) {
                    const savedState = typeof savedStateString === 'string' ? JSON.parse(savedStateString) : savedStateString;
                    if (savedState.status === "PROCESSING") {
                        throw new Error("Duplicate request physically blocked by Idempotency engine.");
                    } else if (savedState.status === "COMPLETED") {
                        return savedState.response;
                    }
                }
            }

            // Await full native execution
            const responseData = await executeLogic();
            
            // If the response indicates failure, do not cache the completed status
            if (responseData && responseData.success === false) {
                await redis.del(redisKey);
            } else {
                // Rewrite lock to successful output
                await redis.set(redisKey, JSON.stringify({ status: "COMPLETED", response: responseData }), { ex: this.ttl });
            }
            return responseData;

        } catch (error) {
            if (error.message !== "Duplicate request physically blocked by Idempotency engine.") {
                await redis.del(redisKey); // Drop the lock so it can properly retry externally
            }
            throw error;
        }
    }
}

module.exports = new IdempotencyHandler();
