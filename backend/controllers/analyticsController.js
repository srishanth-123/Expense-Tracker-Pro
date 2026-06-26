const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const redis = require("../config/redis");
const analyticsService = require("../services/analytics.service");
const aiInsightsService = require("../services/aiInsightsService");
const {
    getFinancialVersion,
    versionedCacheGet,
    CACHE_TTL,
    AI_INSIGHTS_TTL,
} = require("../utils/cacheHelpers");

exports.allTimeSummary = async (req, res) => {
    try {
        const userId = req.user._id;
        const { startDate, endDate, type, category, search } = req.query;
        const cacheKey = `analytics:summary:${userId}:${startDate || ''}:${endDate || ''}:${type || ''}:${category || ''}:${search || ''}`;
        const fv = await getFinancialVersion(userId);

        const { data, cached } = await versionedCacheGet(cacheKey, fv, async () => {
            let match = { user: userId, isDeleted: false };
            if (startDate || endDate) {
                match.date = {};
                if (startDate) match.date.$gte = new Date(startDate);
                if (endDate) match.date.$lte = new Date(endDate);
            }
            if (type) {
                match.type = type;
            }
            if (category) {
                match.category = new mongoose.Types.ObjectId(category);
            }
            if (search && search.trim()) {
                const searchRegex = new RegExp(search.trim(), 'i');
                match.$or = [
                    { description: searchRegex },
                    { amount: isNaN(search) ? undefined : parseFloat(search) },
                    { type: searchRegex }
                ].filter(Boolean);
            }

            const agg = await Transaction.aggregate([
                { $match: match },
                { $group: { _id: "$type", total: { $sum: "$amount" }, count: { $sum: 1 } } }
            ]).read("secondaryPreferred");

            let totalIncome = 0, totalExpense = 0, incomeCount = 0, expenseCount = 0;
            agg.forEach(item => {
                if (item._id === "income") { totalIncome = item.total; incomeCount = item.count; }
                if (item._id === "expense") { totalExpense = item.total; expenseCount = item.count; }
            });

            return { totalIncome, totalExpense, incomeCount, expenseCount };
        });

        res.json({ success: true, message: "Success", data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};


exports.categoryBreakdown = async (req, res) => {
    try {
        const userId = req.user._id;
        const { month, year } = req.query;
        const cacheKey = `analytics:categoryBreakdown:${userId}:${year || ''}:${month || ''}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            const match = { user: userId, type: "expense", isDeleted: false };
            if (month && year) {
                const m = parseInt(month), y = parseInt(year);
                if (!isNaN(m) && !isNaN(y) && m >= 1 && m <= 12) {
                    match.date = { $gte: new Date(y, m - 1, 1), $lte: new Date(y, m, 0, 23, 59, 59, 999) };
                }
            }

            const result = await Transaction.aggregate([
                { $match: match },
                { $group: { _id: "$category", total: { $sum: "$amount" } } },
                { $lookup: { from: "categories", localField: "_id", foreignField: "_id", as: "category" } },
                { $unwind: "$category" },
                { $project: { _id: 0, category: "$category.name", total: 1 } }
            ]).read("secondaryPreferred");

            // Wrap array in object for version tagging
            return { items: result };
        });

        res.json({ success: true, message: "Success", data: data.items || data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.searchTransactions = async (req, res) => {
    try {
        const { keyword } = req.query;

        if (!keyword) {
            return res.status(400).json({ success: false, message: "Invalid request data" });
        }

        const data = await Transaction.find({
            user: req.user._id,
            description: { $regex: keyword, $options: "i" },
            isDeleted: false
        }).populate("category");

        res.json({ success: true, message: "Success", data: data });
    } catch (error) {
        console.error('Search transactions error:', error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};


exports.monthlyReport = async (req, res) => {
    try {
        const userId = req.user._id;
        const { month, year } = req.query;
        const cacheKey = `analytics:monthlyReport:${year}-${month}:${userId}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            const startDate = new Date(year, month - 1, 1);
            const endDate = new Date(year, month, 0);

            const agg = await Transaction.aggregate([
                { $match: { user: userId, date: { $gte: startDate, $lte: endDate }, isDeleted: false } },
                { $group: { _id: "$type", total: { $sum: "$amount" } } }
            ]).read("secondaryPreferred");

            let totalIncome = 0, totalExpense = 0;
            agg.forEach(item => {
                if (item._id === "income") totalIncome = item.total;
                if (item._id === "expense") totalExpense = item.total;
            });

            return { totalIncome, totalExpense };
        });

        res.json({ success: true, message: "Success", data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.topExpenses = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `analytics:topExpenses:${userId}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            const now = new Date();
            const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const result = await analyticsService.getTopExpenses(userId, 10, currentMonthStart);
            return { items: result };
        });

        res.json({ success: true, message: "Success", data: data.items || data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.categoryTrend = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `analytics:categoryTrend:${userId}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            return await analyticsService.getCategoryTrend(userId);
        });

        res.json({ success: true, message: "Success", data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.smartInsights = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `analytics:smartInsights:${userId}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            return await analyticsService.getSmartInsights(userId);
        });

        res.json({ success: true, message: "Success", data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.dailyHeatmap = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `analytics:dailyHeatmap:${userId}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            const result = await analyticsService.getDailyHeatmap(userId);
            return { items: result };
        });

        res.json({ success: true, message: "Success", data: data.items || data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.spendingPrediction = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `analytics:spendingPrediction:${userId}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            return await analyticsService.getSpendingPrediction(userId);
        });

        res.json({ success: true, message: "Success", data });
    } catch (error) {
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── AI Financial Insights ───────────────────────────────────────────────────
exports.aiInsights = async (req, res) => {
    try {
        const userId = req.user._id.toString();
        const cacheKey = `ai-insights:${userId}`;
        const forceRefresh = req.query.refresh === "true";
        const financialVersion = await getFinancialVersion(userId);

        // Always try cache first (even with BullMQ)
        if (redis && !forceRefresh) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    let data;
                    if (typeof cached === "string") {
                        data = JSON.parse(cached);
                    } else if (typeof cached === "object") {
                        data = cached;
                    }

                    if (data) {
                        const insightVersion = data.insightVersion || 0;
                        // Only return cache if it matches or exceeds the current financial data version
                        if (insightVersion >= financialVersion) {
                            return res.json({ success: true, message: "Success", data: { ...data, cached: true } });
                        }
                    }
                }
            } catch (err) {
                console.warn("Redis GET error:", err.message);
            }
        }

        // ─── BullMQ Path: Enqueue and respond immediately ────────────────
        const { insightsQueue } = require("../queues/insightsQueue");
        if (insightsQueue) {
            // Deduplication: prevent adding if already in queue
            const activeJobs = await insightsQueue.getJobs(['waiting', 'active', 'delayed']);
            const existingJob = activeJobs.find(j => j.data && j.data.userId === userId);
            
            if (existingJob) {
                return res.status(202).json({
                    success: true,
                    message: "Insights are being generated",
                    data: { status: "processing" },
                });
            }

            await insightsQueue.add(
                "generate",
                { userId: userId, financialVersion },
                { jobId: `insights-${userId}-${Date.now()}` }
            );
            return res.status(202).json({
                success: true,
                message: "Insights are being generated",
                data: { status: "processing" },
            });
        }

        // ─── Fallback: Synchronous execution (no BullMQ) ────────────────
        const result = await aiInsightsService.generateInsights(req.user._id);
        result.financialDataVersion = financialVersion;
        result.insightVersion = financialVersion;
        result.lastInsightGeneratedAt = new Date().toISOString();

        if (redis) {
            try {
                await redis.set(cacheKey, JSON.stringify(result), { ex: AI_INSIGHTS_TTL });
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

exports.incomeExpenseTrend = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `analytics:incomeExpenseTrend:${userId}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            const trend = await analyticsService.getIncomeExpenseTrend(userId);
            return { items: trend };
        });

        res.json({ success: true, message: "Success", data: data.items || data });
    } catch (error) {
        console.error("Income/Expense trend error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.getFinancialHealthScore = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `analytics:financialHealth:${userId}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            return await aiInsightsService.calculateFinancialHealthScore(userId);
        }, AI_INSIGHTS_TTL);

        res.json({ success: true, message: "Success", data });
    } catch (error) {
        console.error("Financial health score error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Spending Forecast ────────────────────────────────────────────────────────
exports.spendingForecast = async (req, res) => {
    try {
        const userId = req.user._id;
        const cacheKey = `analytics:forecast:${userId}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            const now = new Date();
            const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

            // Get monthly spending by category for last 3 months
            const monthlySpending = await Transaction.aggregate([
                {
                    $match: {
                        user: userId,
                        type: "expense",
                        isDeleted: false,
                        date: { $gte: threeMonthsAgo }
                    }
                },
                {
                    $group: {
                        _id: {
                            month: { $month: "$date" },
                            year: { $year: "$date" },
                            category: "$category"
                        },
                        total: { $sum: "$amount" },
                        count: { $sum: 1 }
                    }
                },
                {
                    $lookup: {
                        from: "categories",
                        localField: "_id.category",
                        foreignField: "_id",
                        as: "categoryInfo"
                    }
                },
                { $unwind: { path: "$categoryInfo", preserveNullAndEmptyArrays: true } }
            ]).read("secondaryPreferred");

            // Aggregate by category and compute average
            const categoryMap = {};
            for (const item of monthlySpending) {
                const catName = item.categoryInfo?.name || "Uncategorized";
                if (!categoryMap[catName]) {
                    categoryMap[catName] = { months: [], totalSpent: 0 };
                }
                categoryMap[catName].months.push(item.total);
                categoryMap[catName].totalSpent += item.total;
            }

            const forecast = Object.entries(categoryMap).map(([category, data]) => {
                const avg = data.totalSpent / Math.max(data.months.length, 1);
                // Simple trend: if spending is increasing, project higher
                const trend = data.months.length >= 2 
                    ? (data.months[data.months.length - 1] - data.months[0]) / data.months.length
                    : 0;
                const projected = Math.max(0, Math.round((avg + trend) * 100) / 100);
                return {
                    category,
                    averageMonthly: Math.round(avg * 100) / 100,
                    trend: trend > 0 ? "increasing" : trend < 0 ? "decreasing" : "stable",
                    projectedNextMonth: projected,
                    historicalMonths: data.months.length
                };
            }).sort((a, b) => b.projectedNextMonth - a.projectedNextMonth);

            const totalProjected = forecast.reduce((sum, f) => sum + f.projectedNextMonth, 0);

            return {
                forecast,
                totalProjectedExpense: Math.round(totalProjected * 100) / 100,
                basedOnMonths: 3,
                generatedAt: new Date().toISOString()
            };
        });

        res.json({ success: true, message: "Success", data });
    } catch (error) {
        console.error("Spending forecast error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};