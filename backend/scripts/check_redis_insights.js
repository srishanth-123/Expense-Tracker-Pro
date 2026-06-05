const redis = require("../config/redis");
const mongoose = require("mongoose");

async function checkRedis() {
    console.log("Checking Redis cache for AI insights...");
    const userId = "6a17d487981033880ed29c3a";
    const cacheKey = `analytics:aiInsights:${userId}`;
    
    if (!redis) {
        console.log("Redis not initialized!");
        return;
    }

    const cached = await redis.get(cacheKey);
    console.log("Cache key:", cacheKey);
    if (cached) {
        const data = typeof cached === "string" ? JSON.parse(cached) : cached;
        console.log("Cached Data details:");
        console.log("Snapshot:", data.snapshot);
        console.log("Summary:", data.summary);
        console.log("Generated At:", data.generatedAt);
        console.log("Source:", data.source);
    } else {
        console.log("No cached data found in Redis for this key!");
    }
}

checkRedis().catch(console.error);
