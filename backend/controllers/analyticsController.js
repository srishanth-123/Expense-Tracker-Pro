const Transaction = require("../models/Transaction");
const redis = require("../config/redis");
const analyticsService = require("../services/analytics.service");
const aiInsightsService = require("../services/aiInsightsService");

exports.allTimeSummary = async (req, res) => {
    try {
        const cacheKey = `analytics:allTimeSummary:${req.user._id}`;
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

        const data = await Transaction.aggregate([
            {
                $match: { user: req.user._id, isDeleted: false }
            },
            {
                $group: {
                    _id: "$type",
                    total: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            }
        ]);

        let totalIncome = 0;
        let totalExpense = 0;
        let incomeCount = 0;
        let expenseCount = 0;

        data.forEach(item => {
            if (item._id === "income") {
                totalIncome = item.total;
                incomeCount = item.count;
            }
            if (item._id === "expense") {
                totalExpense = item.total;
                expenseCount = item.count;
            }
        });

        const result = {
            totalIncome,
            totalExpense,
            incomeCount,
            expenseCount
        };

        if (redis) {
            try {
                await redis.set(cacheKey, result, { ex: 300 }); // 5 minutes TTL
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: result});

    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};


exports.categoryBreakdown = async (req, res) => {
    try {
        const cacheKey = `analytics:categoryBreakdown:${req.user._id}`;
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

        const data = await Transaction.aggregate([
            {
                $match: {
                    user: req.user._id,
                    type: "expense",
                    isDeleted: false
                }
            },
            {
                $group: {
                    _id: "$category",
                    total: { $sum: "$amount" }
                }
            },
            {
                $lookup: {
                    from: "categories",
                    localField: "_id",
                    foreignField: "_id",
                    as: "category"
                }
            },
            {
                $unwind: "$category"
            },
            {
                $project: {
                    _id: 0,
                    category: "$category.name",
                    total: 1
                }
            }
        ]);

        if (redis) {
            try {
                await redis.set(cacheKey, data, { ex: 7200 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: data});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.searchTransactions = async (req, res) => {
    try {
        const { keyword } = req.query;

        if (!keyword) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        const data = await Transaction.find({
            user: req.user._id,
            description: { $regex: keyword, $options: "i" },
            isDeleted: false
        }).populate("category");

        res.json({success: true, message: "Success", data: data});
    } catch (error) {
        console.error('Search transactions error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};


exports.monthlyReport = async (req, res) => {
    try {
        const { month, year } = req.query;

        const cacheKey = `analytics:monthlyReport:${year}-${month}:${req.user._id}`;
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

        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0);

        const data = await Transaction.aggregate([
            {
                $match: {
                    user: req.user._id,
                    date: {
                        $gte: startDate,
                        $lte: endDate
                    },
                    isDeleted: false
                }
            },
            {
                $group: {
                    _id: "$type",
                    total: { $sum: "$amount" }
                }
            }
        ]);

        let totalIncome = 0;
        let totalExpense = 0;

        data.forEach(item => {
            if (item._id === "income") totalIncome = item.total;
            if (item._id === "expense") totalExpense = item.total;
        });

        const result = {
            totalIncome,
            totalExpense
        };

        if (redis) {
            try {
                await redis.set(cacheKey, result, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: result});

    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.topExpenses = async (req, res) => {
    try {
        const cacheKey = `analytics:topExpenses:${req.user._id}`;
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
                // Clear corrupted cache
                try {
                    await redis.del(cacheKey);
                } catch (delErr) {
                    console.warn("Failed to clear cache:", delErr.message);
                }
            }
        }

        const data = await analyticsService.getTopExpenses(req.user._id, 10);

        if (redis) {
            try {
                await redis.set(cacheKey, JSON.stringify(data), { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: data});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.categoryTrend = async (req, res) => {
    try {
        const cacheKey = `analytics:categoryTrend:${req.user._id}`;
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

        const data = await analyticsService.getCategoryTrend(req.user._id);

        if (redis) {
            try {
                await redis.set(cacheKey, data, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: data});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.smartInsights = async (req, res) => {
    try {
        const cacheKey = `analytics:smartInsights:${req.user._id}`;
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

        const data = await analyticsService.getSmartInsights(req.user._id);

        if (redis) {
            try {
                await redis.set(cacheKey, data, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: data});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.dailyHeatmap = async (req, res) => {
    try {
        const cacheKey = `analytics:dailyHeatmap:${req.user._id}`;
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

        const data = await analyticsService.getDailyHeatmap(req.user._id);

        if (redis) {
            try {
                await redis.set(cacheKey, JSON.stringify(data), { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: data});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.spendingPrediction = async (req, res) => {
    try {
        const cacheKey = `analytics:spendingPrediction:${req.user._id}`;
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

        const data = await analyticsService.getSpendingPrediction(req.user._id);

        if (redis) {
            try {
                await redis.set(cacheKey, data, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: data});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

// ─── AI Financial Insights ───────────────────────────────────────────────────
exports.aiInsights = async (req, res) => {
    try {
        const cacheKey = `analytics:aiInsights:${req.user._id}`;
        const forceRefresh = req.query.refresh === "true";

        if (redis && !forceRefresh) {
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
                    if (data) return res.json({ success: true, message: "Success", data: { ...data, cached: true } });
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

        const result = await aiInsightsService.generateInsights(req.user._id);

        if (redis) {
            try {
                // 6h TTL — insights are stable for a few hours
                await redis.set(cacheKey, result, { ex: 60 * 60 * 6 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({ success: true, message: "Success", data: { ...result, cached: false } });
    } catch (error) {
        console.error("AI insights error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};