const searchRegistry = require("../utils/trie");
const redis = require("../config/redis");
const { searchCache } = require("../utils/lruCache");

exports.search = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) {
            return res.json({success: true, message: "Success", data: []});
        }

        const cacheKey = `search:${req.user._id}:${query}`;

        // L1: Check in-memory LRU cache first (Ultra fast, synchronous)
        if (searchCache.has(cacheKey)) {
            return res.json({success: true, message: "Success", data: searchCache.get(cacheKey)});
        }

        // L2: Check external Redis cache second
        if (redis) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) return res.json({success: true, message: "Success", data: typeof cached === "string" ? JSON.parse(cached) : cached});
            } catch (err) {
                console.warn("Redis GET error:", err.message);
            }
        }

        const userTrie = searchRegistry.getTrie(req.user._id);
        const results = userTrie.searchPrefix(query, 10);
        
        // Populate L1 LRU cache
        searchCache.set(cacheKey, results);

        // Populate L2 Redis cache
        if (redis) {
            try {
                await redis.set(cacheKey, results, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: results});
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};
