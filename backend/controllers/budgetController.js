const mongoose = require("mongoose");
const Budget=require("../models/budget");
const Category = require("../models/category");
const Transaction=require("../models/Transaction");
const redis = require("../config/redis");
const budgetService = require("../services/budgetService");
const logger = require("../utils/logger");
const { getBudgetVersion, markBudgetChanged, versionedCacheGet } = require("../utils/cacheHelpers");

// Accept either `limit` or `amount` (alias) from the client.
const readAmount = (body) => {
    const raw = body.limit !== undefined ? body.limit : body.amount;
    return raw;
};

exports.setBudget=async(req,res)=>{
    try {
        const { category, month, year, warningThreshold } = req.body;
        const limit = readAmount(req.body);

        // ── Validation ──
        if (!category || !month || !year || limit === undefined || limit === null) {
            return res.status(400).json({success: false, message: "category, amount, month and year are required"});
        }
        if (!mongoose.Types.ObjectId.isValid(category)) {
            return res.status(400).json({success: false, message: "Invalid category ID format"});
        }
        if (isNaN(year) || Number(year) <= 0) {
            return res.status(400).json({success: false, message: "Invalid year"});
        }
        if (isNaN(limit) || Number(limit) <= 0) {
            return res.status(400).json({success: false, message: "Budget amount must be a positive number"});
        }
        if (Number(month) < 1 || Number(month) > 12) {
            return res.status(400).json({success: false, message: "Invalid month"});
        }
        if (warningThreshold !== undefined && (isNaN(warningThreshold) || warningThreshold < 1 || warningThreshold > 100)) {
            return res.status(400).json({success: false, message: "warningThreshold must be between 1 and 100"});
        }

        // Validate category exists and belongs to the user.
        const cat = await Category.findOne({ _id: category, user: req.user._id, isDeleted: false });
        if (!cat) {
            return res.status(400).json({success: false, message: "Invalid category"});
        }

        // Prevent duplicate budgets for the same category/month/year.
        const existingActive = await Budget.findOne({
            user: req.user._id,
            category,
            month,
            year,
            isDeleted: false
        });
        if (existingActive) {
            return res.status(409).json({success: false, message: "A budget for this category and month already exists"});
        }

        // Check if there is a soft-deleted budget for the same category/month/year that we can reuse
        const existingDeleted = await Budget.findOne({
            user: req.user._id,
            category,
            month,
            year,
            isDeleted: true
        });

        let budget;
        if (existingDeleted) {
            existingDeleted.isDeleted = false;
            existingDeleted.deletedAt = null;
            existingDeleted.limit = Number(limit);
            existingDeleted.warningThreshold = warningThreshold !== undefined ? Number(warningThreshold) : 80;
            existingDeleted.lastNotifiedLevel = 0; // Reset alert level
            budget = await existingDeleted.save();
        } else {
            budget = await Budget.create({
                user: req.user._id,
                category,
                limit: Number(limit),
                month: Number(month),
                year: Number(year),
                warningThreshold: warningThreshold !== undefined ? Number(warningThreshold) : 80
            });
        }

        // Compute initial spend + status (covers pre-existing transactions).
        await budgetService.evaluateBudget(budget);
        await budgetService.invalidateBudgetCache(req.user._id);

        const populated = await Budget.findById(budget._id).populate("category");
        res.status(201).json({success: true, message: "Budget created successfully", data: populated});
    } catch (error) {
        logger.error("Set budget error:", error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.getBudgetById = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({success: false, message: "Invalid budget ID format"});
        }
        const budget = await Budget.findOne({
            _id: req.params.id,
            user: req.user._id,
            isDeleted: false
        }).populate("category");

        if (!budget) {
            return res.status(404).json({success: false, message: "Budget not found"});
        }

        const limit = budget.limit || 0;
        const percentage = limit > 0 ? Math.round((budget.spentAmount / limit) * 100) : 0;
        const status = budgetService.getBudgetStatus(percentage, budget.warningThreshold);

        res.json({
            success: true,
            message: "Success",
            data: { ...budget.toObject(), percentage, remaining: Math.max(limit - budget.spentAmount, 0), status }
        });
    } catch (error) {
        console.error("Get budget by id error:", error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.updateBudget = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({success: false, message: "Invalid budget ID format"});
        }
        const { month, year, warningThreshold } = req.body;
        const limit = readAmount(req.body);

        const budget = await Budget.findOne({ _id: req.params.id, user: req.user._id, isDeleted: false });
        if (!budget) {
            return res.status(404).json({success: false, message: "Budget not found"});
        }

        if (limit !== undefined && limit !== null) {
            if (isNaN(limit) || Number(limit) <= 0) {
                return res.status(400).json({success: false, message: "Budget amount must be a positive number"});
            }
            budget.limit = Number(limit);
        }
        if (warningThreshold !== undefined) {
            if (isNaN(warningThreshold) || warningThreshold < 1 || warningThreshold > 100) {
                return res.status(400).json({success: false, message: "warningThreshold must be between 1 and 100"});
            }
            budget.warningThreshold = Number(warningThreshold);
        }
        if (month !== undefined) {
            if (Number(month) < 1 || Number(month) > 12) {
                return res.status(400).json({success: false, message: "Invalid month"});
            }
            budget.month = Number(month);
        }
        if (year !== undefined) {
            if (isNaN(year) || Number(year) <= 0) {
                return res.status(400).json({success: false, message: "Invalid year"});
            }
            budget.year = Number(year);
        }

        // Reset notification level so thresholds re-evaluate against the new limit.
        budget.lastNotifiedLevel = 0;
        await budget.save();

        // Recompute spend/status against (possibly new) limit/month/year.
        await budgetService.evaluateBudget(budget);
        await budgetService.invalidateBudgetCache(req.user._id);

        const populated = await Budget.findById(budget._id).populate("category");
        res.json({success: true, message: "Budget updated successfully", data: populated});
    } catch (error) {
        console.error("Update budget error:", error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

// Budget vs spending summary for a given month/year (defaults to current month).
exports.getBudgetSummary = async (req, res) => {
    try {
        const now = new Date();
        const month = Number(req.query.month) || (now.getMonth() + 1);
        const year = Number(req.query.year) || now.getFullYear();

        const budgets = await Budget.find({
            user: req.user._id,
            month,
            year,
            isDeleted: false
        }).populate("category");

        let totalBudget = 0;
        let totalSpent = 0;
        const overspending = [];

        const categories = budgets.map(b => {
            const limit = b.limit || 0;
            const spent = b.spentAmount || 0;
            const percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
            const status = budgetService.getBudgetStatus(percentage, b.warningThreshold);
            totalBudget += limit;
            totalSpent += spent;
            if (spent > limit) {
                overspending.push({
                    budgetId: b._id,
                    category: b.category?.name || "Unknown",
                    over: Math.round((spent - limit) * 100) / 100
                });
            }
            return {
                budgetId: b._id,
                category: b.category,
                limit,
                amount: limit,
                spent,
                remaining: Math.max(limit - spent, 0),
                percentage,
                status
            };
        });

        res.json({
            success: true,
            message: "Success",
            data: {
                month,
                year,
                totalBudget,
                totalSpent,
                totalRemaining: Math.max(totalBudget - totalSpent, 0),
                overallPercentage: totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0,
                overspending,
                categories
            }
        });
    } catch (error) {
        console.error("Get budget summary error:", error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.getBudgets = async (req, res) => {
    try {
        const cacheKey = `budgets:${req.user._id}`;
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

        const budgets = await Budget.find({
            user: req.user._id,
            isDeleted: false
        }).populate("category");

        // Attach computed status/percentage/remaining using stored spentAmount.
        const enriched = budgets.map(b => {
            const obj = b.toObject();
            const limit = obj.limit || 0;
            const spent = obj.spentAmount || 0;
            obj.percentage = limit > 0 ? Math.round((spent / limit) * 100) : 0;
            obj.remaining = Math.max(limit - spent, 0);
            obj.status = budgetService.getBudgetStatus(obj.percentage, obj.warningThreshold);
            return obj;
        });

        if (redis) {
            try {
                await redis.set(cacheKey, enriched, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: enriched});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.checkBudget=async(req,res)=>{
    const month = Number(req.query.month);
    const year = Number(req.query.year);

    if (isNaN(month) || month < 1 || month > 12 || isNaN(year) || year <= 0) {
        return res.status(400).json({success: false, message: "Valid month and year query parameters are required"});
    }

    const userId = req.user._id;
    const bv = await getBudgetVersion(userId);
    const cacheKey = `checkBudgets:${userId}:v${bv}:${month}-${year}`;

    try {
        const { data } = await versionedCacheGet(cacheKey, bv, async () => {
            const budgets=await Budget.find({
                user:userId,
                month,
                year,
                isDeleted: false
            });

            const spentData = await Transaction.aggregate([
                {
                    $match: {
                        user: userId,
                        type: "expense",
                        date: {
                            $gte: new Date(Date.UTC(year, month - 1, 1)),
                            $lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
                        },
                        isDeleted: false
                    }
                },
                {
                    $group: {
                        _id: "$category",
                        total: { $sum: "$amount" }
                    }
                }
            ]);

            const spentMap = new Map();
            spentData.forEach(item => {
                if (item._id) {
                    spentMap.set(item._id.toString(), item.total);
                }
            });

            const results = budgets.map(budget => {
                const categoryIdStr = budget.category ? budget.category.toString() : "";
                const totalSpent = spentMap.get(categoryIdStr) || 0;
                return {
                    category: budget.category,
                    limit: budget.limit,
                    spent: totalSpent,
                    exceeded: totalSpent > budget.limit
                };
            });

            return { results };
        }, 300);

        res.json({success: true, message: "Success", data: data.results});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.deleteBudget = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({success: false, message: "Invalid budget ID format"});
        }
        const budget = await Budget.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { isDeleted: true, deletedAt: new Date() }
        );

        if (!budget) {
            return res.status(404).json({success: false, message: "Resource not found"});
        }

        if (redis) {
            try {
                await redis.del(`budgets:${req.user._id}`);
                await markBudgetChanged(req.user._id);
            } catch (err) {
                console.warn("Redis invalidation error:", err.message);
            }
        }

        res.json({success: true, message: "Budget deleted successfully" });
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.restoreBudget = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({success: false, message: "Invalid budget ID format"});
        }
        const budget = await Budget.findOne({ _id: req.params.id, user: req.user._id });
        
        if (!budget) {
            return res.status(404).json({success: false, message: "Resource not found"});
        }

        if (!budget.isDeleted) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        budget.isDeleted = false;
        budget.deletedAt = null;
        await budget.save();

        // Recompute spend/status after restore.
        await budgetService.evaluateBudget(budget);
        await budgetService.invalidateBudgetCache(req.user._id);

        res.json({success: true, message: "Budget restored successfully" });
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};
