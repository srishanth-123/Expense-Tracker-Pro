/**
 * Action Executor
 * ───────────────
 * Safe execution bridge between AI-parsed intents and existing business logic.
 *
 * CRITICAL DESIGN:
 *   The AI NEVER writes to MongoDB directly. Every mutation goes through the
 *   same validation and side-effect pipeline as the normal API controllers:
 *   - Transaction creation → trie update, cache wipe, budget sync
 *   - Budget creation     → evaluate spend, cache invalidation
 *   - Category creation   → trie insert, cache invalidation
 *
 *   This guarantees that wallet balances, budgets, search indexes, caches,
 *   and notifications remain consistent regardless of whether the action
 *   was initiated by the UI or the AI assistant.
 */

const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const Budget = require("../models/budget");
const Category = require("../models/category");
const User = require("../models/user");
const redis = require("../config/redis");
const { invalidateUserSearchCache } = require("../utils/lruCache");
const budgetService = require("../services/budgetService");
const { normalizeCategoryName } = require("./categoryNormalizer");
const analyticsService = require("../services/analytics.service");
const logger = require("./logger");

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve a category name to its ObjectId for a given user.
 * Case-insensitive match. Returns null if not found.
 */
async function resolveCategory(userId, categoryName) {
    if (!categoryName) return null;

    const category = await Category.findOne({
        user: userId,
        name: { $regex: new RegExp(`^${escapeRegex(categoryName)}$`, "i") },
        isDeleted: false
    });

    return category;
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Wipe transaction-dependent caches (same logic as transactionController).
 */
async function wipeTransactionCaches(userId) {
    if (!redis) return;
    try {
        const analyticsKeys = await redis.keys(`analytics:*:${userId}*`);
        const transactionKeys = await redis.keys(`transactions:${userId}:*`);
        const budgetKeys = await redis.keys(`checkBudgets:${userId}:*`);
        const searchKeys = await redis.keys(`search:${userId}:*`);

        const allKeys = [...analyticsKeys, ...transactionKeys, ...budgetKeys, ...searchKeys];
        if (allKeys.length > 0) {
            await redis.del(...allKeys);
        }
    } catch (err) {
        logger.warn(`[ActionExecutor] Cache wipe error: ${err.message}`);
    }
}

// ─── Transaction Operations ──────────────────────────────────────────────────

/**
 * Create a transaction via the AI assistant.
 * Mirrors transactionController.addTransaction logic exactly.
 * Defaults to paymentMethod: "cash" (no wallet deduction).
 *
 * @param {string} userId
 * @param {Object} fields - { amount, type, categoryName, description, date }
 * @returns {Object} { success, data, message }
 */
async function executeCreateTransaction(userId, fields) {
    try {
        const { amount, type, categoryName, description, date } = fields;

        // Validate required fields
        if (!amount || !type || !categoryName) {
            return { success: false, message: "Missing required fields: amount, type, and category." };
        }

        if (!["income", "expense"].includes(type)) {
            return { success: false, message: "Type must be 'income' or 'expense'." };
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return { success: false, message: "Amount must be a positive number." };
        }

        // Resolve category name → ObjectId
        const category = await resolveCategory(userId, categoryName);
        if (!category) {
            return {
                success: false,
                message: `Category "${categoryName}" not found. Would you like me to create it first?`
            };
        }

        // Create the transaction (NO wallet deduction — cash payment)
        const transaction = await Transaction.create({
            amount: parsedAmount,
            type,
            category: category._id,
            description: description || `AI: ${type} - ${categoryName}`,
            date: date ? new Date(date) : new Date(),
            user: userId
        });

        const populated = await Transaction.findById(transaction._id).populate("category");

        // Side effects — identical to transactionController
        if (description || transaction.description) {
            invalidateUserSearchCache(userId);
        }

        await wipeTransactionCaches(userId);

        // Budget sync for expenses
        if (type === "expense") {
            await budgetService.syncBudgetForTransaction(
                userId,
                category._id,
                date ? new Date(date) : new Date()
            );
        }

        return {
            success: true,
            message: `✅ ${type === "expense" ? "Expense" : "Income"} of ₹${parsedAmount.toLocaleString("en-IN")} created under "${category.name}".`,
            data: {
                id: populated._id,
                amount: populated.amount,
                type: populated.type,
                category: populated.category?.name,
                description: populated.description,
                date: populated.date
            }
        };
    } catch (err) {
        logger.error(`[ActionExecutor] createTransaction error: ${err.message}`, err);
        return { success: false, message: "Failed to create transaction. Please try again." };
    }
}

/**
 * Search matching transactions for user selection/disambiguation.
 */
async function findMatchingTransactions(userId, criteria = {}) {
    const query = { user: userId, isDeleted: false };
    
    if (criteria.amount) {
        query.amount = criteria.amount;
    }
    
    if (criteria.type) {
        query.type = criteria.type;
    }
    
    if (criteria.categoryName) {
        const cat = await resolveCategory(userId, criteria.categoryName);
        if (cat) {
            query.category = cat._id;
        } else {
            return [];
        }
    }
    
    if (criteria.description) {
        query.description = { $regex: new RegExp(escapeRegex(criteria.description), "i") };
    }
    
    if (criteria.date) {
        const dateObj = new Date(criteria.date);
        if (!isNaN(dateObj)) {
            const start = new Date(dateObj.setHours(0,0,0,0));
            const end = new Date(dateObj.setHours(23,59,59,999));
            query.date = { $gte: start, $lte: end };
        }
    }
    
    return await Transaction.find(query)
        .populate("category")
        .sort({ date: -1 })
        .limit(10)
        .lean();
}

/**
 * Delete a transaction via AI assistant.
 */
async function executeDeleteTransaction(userId, transactionId) {
    try {
        const transaction = await Transaction.findOne({ _id: transactionId, user: userId, isDeleted: false });
        if (!transaction) {
            return { success: false, message: "Transaction not found or already deleted." };
        }
        
        transaction.isDeleted = true;
        transaction.deletedAt = new Date();
        await transaction.save();
        
        if (transaction.description) {
            invalidateUserSearchCache(userId);
        }
        
        await wipeTransactionCaches(userId);
        
        if (transaction.type === "expense") {
            await budgetService.syncBudgetForTransaction(userId, transaction.category, transaction.date);
        }
        
        return { 
            success: true, 
            message: `Deleted transaction: ${transaction.description || 'Unspecified'} (₹${transaction.amount})` 
        };
    } catch (err) {
        logger.error(`[ActionExecutor] deleteTransaction error: ${err.message}`, err);
        return { success: false, message: "Failed to delete transaction." };
    }
}

/**
 * Update a transaction via AI assistant.
 */
async function executeUpdateTransaction(userId, transactionId, updates) {
    try {
        const transaction = await Transaction.findOne({ _id: transactionId, user: userId, isDeleted: false });
        if (!transaction) {
            return { success: false, message: "Transaction not found." };
        }
        
        const oldDescription = transaction.description;
        const oldCategory = transaction.category;
        const oldDate = transaction.date;
        const oldType = transaction.type;
        
        const updateData = {};
        if (updates.newAmount !== undefined && updates.newAmount !== null) {
            updateData.amount = parseFloat(updates.newAmount);
        }
        if (updates.newDescription !== undefined && updates.newDescription !== null) {
            updateData.description = updates.newDescription;
        }
        if (updates.newCategoryName) {
            const cat = await resolveCategory(userId, updates.newCategoryName);
            if (!cat) {
                return { success: false, message: `Category "${updates.newCategoryName}" not found.` };
            }
            updateData.category = cat._id;
        }
        if (updates.newDate) {
            updateData.date = new Date(updates.newDate);
        }
        if (updates.newType) {
            updateData.type = updates.newType;
        }
        
        const updated = await Transaction.findByIdAndUpdate(
            transactionId,
            updateData,
            { new: true }
        ).populate("category");
        
        const newDesc = updates.newDescription || updated.description;
        if (newDesc !== undefined && newDesc !== oldDescription) {
            invalidateUserSearchCache(userId);
        }
        
        await wipeTransactionCaches(userId);
        
        if (oldType === "expense" || updated.type === "expense") {
            await budgetService.syncBudgetsForTransactionChange(
                userId,
                oldCategory,
                oldDate,
                updated.category?._id || updated.category,
                updated.date
            );
        }
        
        return { 
            success: true, 
            message: "Transaction updated successfully.", 
            data: {
                id: updated._id,
                amount: updated.amount,
                type: updated.type,
                category: updated.category?.name,
                description: updated.description,
                date: updated.date
            }
        };
    } catch (err) {
        logger.error(`[ActionExecutor] updateTransaction error: ${err.message}`, err);
        return { success: false, message: "Failed to update transaction." };
    }
}

// ─── Budget Operations ───────────────────────────────────────────────────────

/**
 * Create a budget via the AI assistant.
 * Mirrors budgetController.setBudget logic exactly.
 */
async function executeCreateBudget(userId, fields) {
    try {
        const { categoryName, budgetLimit, month, year } = fields;

        const now = new Date();
        const targetMonth = month || (now.getMonth() + 1);
        const targetYear = year || now.getFullYear();
        const limit = parseFloat(budgetLimit);

        if (!categoryName || isNaN(limit) || limit <= 0) {
            return { success: false, message: "Category and a positive budget amount are required." };
        }

        const category = await resolveCategory(userId, categoryName);
        if (!category) {
            return {
                success: false,
                message: `Category "${categoryName}" not found. Would you like me to create it first?`
            };
        }

        const existing = await Budget.findOne({
            user: userId,
            category: category._id,
            month: targetMonth,
            year: targetYear,
            isDeleted: false
        });

        if (existing) {
            return {
                success: false,
                message: `A budget is already set for "${category.name}" in ${targetMonth}/${targetYear}. Ask me to edit it instead!`
            };
        }

        const budget = await Budget.create({
            user: userId,
            category: category._id,
            limit,
            month: targetMonth,
            year: targetYear
        });

        await budgetService.evaluateBudget(budget);
        await budgetService.invalidateBudgetCache(userId);

        const populated = await Budget.findById(budget._id).populate("category");

        return {
            success: true,
            message: `✅ Monthly budget for "${category.name}" set to ₹${limit.toLocaleString("en-IN")}.`,
            data: {
                id: populated._id,
                category: populated.category?.name,
                limit: populated.limit,
                month: populated.month,
                year: populated.year
            }
        };
    } catch (err) {
        logger.error(`[ActionExecutor] createBudget error: ${err.message}`, err);
        return { success: false, message: "Failed to create budget." };
    }
}

/**
 * Search matching budgets.
 */
async function findMatchingBudgets(userId, criteria = {}) {
    const query = { user: userId, isDeleted: false };
    
    if (criteria.categoryName) {
        const cat = await resolveCategory(userId, criteria.categoryName);
        if (cat) {
            query.category = cat._id;
        } else {
            return [];
        }
    }
    
    const now = new Date();
    query.month = criteria.month || (now.getMonth() + 1);
    query.year = criteria.year || now.getFullYear();
    
    return await Budget.find(query).populate("category").limit(5).lean();
}

/**
 * Delete a budget.
 */
async function executeDeleteBudget(userId, budgetId) {
    try {
        const budget = await Budget.findOneAndUpdate(
            { _id: budgetId, user: userId },
            { isDeleted: true, deletedAt: new Date() }
        );
        
        if (!budget) {
            return { success: false, message: "Budget not found." };
        }
        
        if (redis) {
            try {
                await redis.del(`budgets:${userId}`);
                const keys = await redis.keys(`checkBudgets:${userId}:*`);
                if (keys.length > 0) {
                    await redis.del(...keys);
                }
            } catch (err) {
                logger.warn(`Redis error in delete budget: ${err.message}`);
            }
        }
        
        return { success: true, message: `Budget for "${budget.month}/${budget.year}" deleted successfully.` };
    } catch (err) {
        logger.error(`[ActionExecutor] deleteBudget error: ${err.message}`, err);
        return { success: false, message: "Failed to delete budget." };
    }
}

/**
 * Update a budget.
 */
async function executeUpdateBudget(userId, budgetId, updates) {
    try {
        const budget = await Budget.findOne({ _id: budgetId, user: userId, isDeleted: false });
        if (!budget) {
            return { success: false, message: "Budget not found." };
        }
        
        if (updates.newLimit !== undefined && updates.newLimit !== null) {
            budget.limit = Number(updates.newLimit);
        }
        if (updates.newMonth !== undefined && updates.newMonth !== null) {
            budget.month = Number(updates.newMonth);
        }
        if (updates.newYear !== undefined && updates.newYear !== null) {
            budget.year = Number(updates.newYear);
        }
        
        budget.lastNotifiedLevel = 0;
        await budget.save();
        
        await budgetService.evaluateBudget(budget);
        await budgetService.invalidateBudgetCache(userId);
        
        const populated = await Budget.findById(budgetId).populate("category");
        return { 
            success: true, 
            message: `Budget updated successfully.`,
            data: {
                id: populated._id,
                category: populated.category?.name,
                limit: populated.limit,
                month: populated.month,
                year: populated.year
            }
        };
    } catch (err) {
        logger.error(`[ActionExecutor] updateBudget error: ${err.message}`, err);
        return { success: false, message: "Failed to update budget." };
    }
}

// ─── Category Operations ─────────────────────────────────────────────────────

/**
 * Create a category via AI assistant.
 * Mirrors categoryController.createCategory logic exactly.
 */
async function executeCreateCategory(userId, fields) {
    try {
        const { categoryNewName } = fields;
        if (!categoryNewName || categoryNewName.trim().length === 0) {
            return { success: false, message: "Category name is required." };
        }

        const normalizedName = normalizeCategoryName(categoryNewName);
        const existing = await resolveCategory(userId, normalizedName);
        if (existing) {
            return { success: false, message: `Category "${normalizedName}" already exists.` };
        }

        const category = await Category.create({
            name: normalizedName,
            user: userId
        });

        invalidateUserSearchCache(userId);

        if (redis) {
            try {
                await redis.del(`categories:${userId}`);
                const searchKeys = await redis.keys(`search:${userId}:*`);
                if (searchKeys.length > 0) await redis.del(...searchKeys);
            } catch (err) {
                logger.warn(`Redis error on category create: ${err.message}`);
            }
        }

        return {
            success: true,
            message: `✅ Category "${category.name}" created successfully.`,
            data: {
                id: category._id,
                name: category.name
            }
        };
    } catch (err) {
        logger.error(`[ActionExecutor] createCategory error: ${err.message}`, err);
        return { success: false, message: "Failed to create category." };
    }
}

/**
 * Search matching categories.
 */
async function findMatchingCategories(userId, name) {
    if (!name) return [];
    
    return await Category.find({ 
        user: userId, 
        isDeleted: false,
        name: { $regex: new RegExp(escapeRegex(name), "i") }
    }).limit(5).lean();
}

/**
 * Delete a category.
 */
async function executeDeleteCategory(userId, categoryId) {
    try {
        const category = await Category.findOneAndUpdate(
            { _id: categoryId, user: userId },
            { isDeleted: true, deletedAt: new Date() }
        );
        
        if (!category) {
            return { success: false, message: "Category not found." };
        }
        
        invalidateUserSearchCache(userId);
        
        if (redis) {
            try {
                await redis.del(`categories:${userId}`);
                const searchKeys = await redis.keys(`search:${userId}:*`);
                if (searchKeys.length > 0) await redis.del(...searchKeys);
            } catch (err) {
                logger.warn(`Redis error in delete category: ${err.message}`);
            }
        }
        
        return { success: true, message: `Category "${category.name}" deleted successfully.` };
    } catch (err) {
        logger.error(`[ActionExecutor] deleteCategory error: ${err.message}`, err);
        return { success: false, message: "Failed to delete category." };
    }
}

/**
 * Update a category (Rename).
 */
async function executeUpdateCategory(userId, categoryId, newName) {
    try {
        if (!newName || newName.trim().length === 0) {
            return { success: false, message: "New name is required." };
        }
        
        const category = await Category.findOne({ _id: categoryId, user: userId, isDeleted: false });
        if (!category) {
            return { success: false, message: "Category not found." };
        }
        
        const oldName = category.name;
        category.name = newName;
        await category.save();
        
        invalidateUserSearchCache(userId);
        
        if (redis) {
            try {
                await redis.del(`categories:${userId}`);
                const searchKeys = await redis.keys(`search:${userId}:*`);
                if (searchKeys.length > 0) await redis.del(...searchKeys);
            } catch (err) {
                logger.warn(`Redis error in rename category: ${err.message}`);
            }
        }
        
        return { 
            success: true, 
            message: `Category renamed from "${oldName}" to "${newName}" successfully.`,
            data: {
                id: category._id,
                name: category.name
            }
        };
    } catch (err) {
        logger.error(`[ActionExecutor] updateCategory error: ${err.message}`, err);
        return { success: false, message: "Failed to rename category." };
    }
}

// ─── Analytics Queries ───────────────────────────────────────────────────────

/**
 * Execute an analytics query and return real data summaries for LLM grounding.
 * Matches intents to the correct services.
 */
async function executeAnalyticsQuery(userId, analyticsType) {
    try {
        const uid = new mongoose.Types.ObjectId(userId);

        switch (analyticsType) {
            case "total_spending":
            case "smart_insights": {
                const insights = await analyticsService.getSmartInsights(uid);
                return {
                    success: true,
                    data: insights,
                    summary: `Total spending this month: ₹${insights.currentTotal.toLocaleString("en-IN")}, compared to ₹${insights.prevTotal.toLocaleString("en-IN")} last month.\nInsights: ${insights.insights.join(" ")}`
                };
            }
            case "category_breakdown": {
                const rawBreakdown = await Transaction.aggregate([
                    { $match: { user: uid, isDeleted: false } },
                    {
                        $group: {
                            _id: "$category",
                            total: { $sum: "$amount" },
                            count: { $sum: 1 }
                        }
                    },
                    {
                        $lookup: {
                            from: "categories",
                            localField: "_id",
                            foreignField: "_id",
                            as: "catInfo"
                        }
                    },
                    { $unwind: "$catInfo" },
                    { $project: { name: "$catInfo.name", total: 1, count: 1 } }
                ]);

                const textSummary = rawBreakdown.map(c => `- ${c.name}: ₹${c.total} (${c.count} transactions)`).join("\n") || "No spending recorded this month.";
                return {
                    success: true,
                    data: rawBreakdown,
                    summary: `Spendings by category:\n${textSummary}`
                };
            }
            case "top_expenses": {
                const top = await analyticsService.getTopExpenses(uid);
                const textSummary = top.map(t => `- ₹${t.amount} for "${t.description}" on ${new Date(t.date).toLocaleDateString("en-IN")}`).join("\n") || "No transactions found.";
                return {
                    success: true,
                    data: top,
                    summary: `Top expenses:\n${textSummary}`
                };
            }
            case "spending_prediction": {
                const pred = await analyticsService.getSpendingPrediction(uid);
                return {
                    success: true,
                    data: pred,
                    summary: `Predicted spending for next month: ₹${pred.predictedExpense.toLocaleString("en-IN")}. Explanation: ${pred.insights || "Based on historical average trends."}`
                };
            }
            case "budget_status": {
                const budgets = await Budget.find({
                    user: uid,
                    month: new Date().getMonth() + 1,
                    year: new Date().getFullYear(),
                    isDeleted: false
                }).populate("category").lean();

                const textSummary = budgets.map(b => {
                    const pct = b.limit > 0 ? Math.round((b.spentAmount / b.limit) * 100) : 0;
                    return `- ${b.category?.name || "Unknown"}: ₹${b.spentAmount || 0} spent of ₹${b.limit} limit (${pct}% consumed)`;
                }).join("\n") || "No budgets set for this month.";

                return {
                    success: true,
                    data: budgets,
                    summary: `Current budget statuses:\n${textSummary}`
                };
            }
            default:
                return { success: false, message: `Unsupported analytics type: ${analyticsType}` };
        }
    } catch (err) {
        logger.error(`[ActionExecutor] executeAnalyticsQuery error: ${err.message}`, err);
        return { success: false, message: "Analytics retrieval failed." };
    }
}

// ─── Financial Context ───────────────────────────────────────────────────────

/**
 * Builds RAG-like financial snapshot text for LLM prompts.
 */
async function buildFinancialContext(userId) {
    try {
        const uid = new mongoose.Types.ObjectId(userId);

        const [user, categories, recentTransactions, budgets, insights, prediction] = await Promise.all([
            User.findById(uid).select("name walletBalance isPro").lean(),
            Category.find({ user: uid, isDeleted: false }).select("name").lean(),
            Transaction.find({ user: uid, isDeleted: false })
                .sort({ date: -1 })
                .limit(10)
                .populate("category")
                .lean(),
            Budget.find({
                user: uid,
                month: new Date().getMonth() + 1,
                year: new Date().getFullYear(),
                isDeleted: false
            }).populate("category").lean(),
            analyticsService.getSmartInsights(uid).catch(() => ({ insights: [], currentTotal: 0, prevTotal: 0 })),
            analyticsService.getSpendingPrediction(uid).catch(() => ({ predictedExpense: 0 }))
        ]);

        const catList = categories.map(c => c.name).join(", ") || "None";

        const txnList = recentTransactions.map(t =>
            `- ₹${t.amount} ${t.type} on ${t.category?.name || "Uncategorized"} ("${t.description}") [${new Date(t.date).toLocaleDateString("en-IN")}]`
        ).join("\n") || "No recent transactions.";

        const budgetList = budgets.map(b => {
            const pct = b.limit > 0 ? Math.round((b.spentAmount / b.limit) * 100) : 0;
            return `- ${b.category?.name || "Unknown"}: ₹${b.spentAmount || 0}/₹${b.limit} (${pct}%)`;
        }).join("\n") || "No budgets set.";

        return `
User: ${user.name} | Wallet: ₹${user.walletBalance.toFixed(2)} | Tier: ${user.isPro ? "Pro" : "Free"}
Categories: ${catList}

Recent Transactions (last 10):
${txnList}

Active Budgets (${new Date().getMonth() + 1}/${new Date().getFullYear()}):
${budgetList}

Monthly Insights: ${insights.insights.join(" ")}
Current month spending: ₹${insights.currentTotal} | Last month: ₹${insights.prevTotal}
Predicted next month: ₹${prediction.predictedExpense}
        `.trim();
    } catch (err) {
        logger.error(`[ActionExecutor] buildFinancialContext error: ${err.message}`);
        return "Financial context unavailable.";
    }
}

module.exports = {
    executeCreateTransaction,
    executeCreateBudget,
    executeCreateCategory,
    executeAnalyticsQuery,
    buildFinancialContext,
    resolveCategory,
    
    // Expanded methods
    findMatchingTransactions,
    findMatchingBudgets,
    findMatchingCategories,
    executeDeleteTransaction,
    executeUpdateTransaction,
    executeDeleteBudget,
    executeUpdateBudget,
    executeDeleteCategory,
    executeUpdateCategory
};
