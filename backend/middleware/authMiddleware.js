const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const User = require("../models/user");

// Short-lived user cache — 30 seconds TTL.
// Eliminates redundant DB reads across the ~9 concurrent dashboard requests
// that all authenticate against the same user document simultaneously.
// Gracefully falls back to DB if Redis is unavailable.
let redis;
try {
    redis = require("../config/redis");
} catch (_) {
    redis = null;
}

const USER_CACHE_TTL = 30; // seconds
const getUserCacheKey = (userId) => `user-cache:${userId}`;

/**
 * Rehydrate a plain object from Redis back into something controllers can use.
 * JSON.stringify/parse converts MongoDB ObjectId → plain string.
 * We must convert _id back to ObjectId so queries like
 * Transaction.find({ user: req.user._id }) work correctly.
 */
const rehydrateUser = (parsed) => {
    if (!parsed) return null;
    if (parsed._id && typeof parsed._id === "string") {
        try {
            parsed._id = new mongoose.Types.ObjectId(parsed._id);
        } catch (_) {
            // Invalid ObjectId string — treat as cache miss
            return null;
        }
    }
    return parsed;
};

const protect = async(req, res, next) => {
    try {
        let token;
        
        if (req.cookies && req.cookies.token) {
            token = req.cookies.token;
        } else if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }
        
        if (!token) {
            return res.status(401).json({ success: false, message: "Access denied. No token provided." });
        }
        
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.id;

        // ── L1: Try Redis cache first ────────────────────────────────────────
        let user = null;
        if (redis) {
            try {
                const cached = await redis.get(getUserCacheKey(userId));
                if (cached) {
                    const parsed = typeof cached === "string" ? JSON.parse(cached) : cached;
                    // IMPORTANT: rehydrate _id back to ObjectId — JSON serialisation
                    // converts ObjectId to a plain string, which breaks all DB queries.
                    user = rehydrateUser(parsed);
                }
            } catch (_) {
                // Redis failure is non-fatal — fall through to DB
                user = null;
            }
        }

        // ── L2: DB fallback (and cache population) ───────────────────────────
        if (!user) {
            const dbUser = await User.findById(userId).select("-password");
            if (!dbUser) {
                return res.status(401).json({ success: false, message: "Invalid token. User not found." });
            }

            // Auto-expiry check — only runs on DB read, not on cache hit
            if (dbUser.plan === "PRO" && dbUser.subscriptionEndDate && new Date() > dbUser.subscriptionEndDate) {
                dbUser.plan = "FREE";
                dbUser.subscriptionStatus = "EXPIRED";
                await dbUser.save();
            }

            user = dbUser.toObject ? dbUser.toObject() : dbUser;

            // Populate cache for subsequent parallel requests
            if (redis) {
                try {
                    await redis.set(getUserCacheKey(userId), JSON.stringify(user), { ex: USER_CACHE_TTL });
                } catch (_) {
                    // Non-fatal
                }
            }
        }

        req.user = user;
        next();
    } catch (error) {
        console.error('Auth middleware error:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({ success: false, message: "Invalid token." });
        } else if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ success: false, message: "Token expired." });
        } else {
            return res.status(500).json({ success: false, message: "Server error in authentication." });
        }
    }
};

// Call this whenever user data mutates (balance change, plan change, etc.)
// so the cache is invalidated immediately rather than waiting for TTL.
const invalidateUserCache = async (userId) => {
    if (!redis) return;
    try {
        await redis.del(getUserCacheKey(String(userId)));
    } catch (_) {
        // Non-fatal
    }
};

module.exports = protect;
module.exports.invalidateUserCache = invalidateUserCache;
