const Category = require("../models/category");
const Transaction = require("../models/Transaction");
const redis = require("../config/redis");
const { searchCache } = require("../utils/lruCache");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.search = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query || !query.trim()) {
            return res.json({success: true, message: "Success", data: []});
        }

        const cleanQuery = query.trim();
        const cacheKey = `search:${req.user._id}:${cleanQuery}`;

        // L1: Check in-memory LRU cache first (Ultra fast, synchronous)
        if (searchCache.has(cacheKey)) {
            return res.json({success: true, message: "Success", data: searchCache.get(cacheKey)});
        }

        // L2: Check external Redis cache second
        if (redis) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    let data;
                    if (typeof cached === "string") {
                        data = JSON.parse(cached);
                    } else if (typeof cached === "object") {
                        data = cached;
                    } else {
                        console.warn("Redis cache invalid type:", typeof cached);
                        await redis.del(cacheKey);
                    }
                    if (data) return res.json({success: true, message: "Success", data: data});
                }
            } catch (err) {
                console.warn("Redis GET error:", err.message);
                try {
                    await redis.del(cacheKey);
                } catch (delErr) {
                    console.warn("Failed to clear cache:", delErr.message);
                }
            }
        }

        const regex = new RegExp(`^${escapeRegex(cleanQuery)}`, "i");

        const [categories, transactions] = await Promise.all([
            Category.find({
                user: req.user._id,
                isDeleted: false,
                name: { $regex: regex }
            }).limit(10).lean(),
            Transaction.find({
                user: req.user._id,
                isDeleted: false,
                description: { $regex: regex }
            }).limit(10).lean()
        ]);

        const results = [];
        categories.forEach(c => {
            results.push({
                id: c._id.toString(),
                text: c.name,
                type: 'category'
            });
        });

        transactions.forEach(t => {
            results.push({
                id: t._id.toString(),
                text: t.description,
                type: 'transaction'
            });
        });

        const slicedResults = results.slice(0, 10);

        // Populate L1 LRU cache
        searchCache.set(cacheKey, slicedResults);

        // Populate L2 Redis cache
        if (redis) {
            try {
                await redis.set(cacheKey, slicedResults, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: slicedResults});
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};
