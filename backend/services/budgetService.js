const mongoose = require("mongoose");
const Budget = require("../models/budget");
const Transaction = require("../models/Transaction");
const Notification = require("../models/notificationModel");
const redis = require("../config/redis");
const { sendNotificationToUser } = require("../utils/socket");
const { markFinancialDataChanged, markBudgetChanged } = require("../utils/cacheHelpers");

/**
 * Budget Service
 * -------------------------------------------------------------
 * Maintains the `spentAmount` / `exceeded` tracking fields on budgets and
 * fires notifications when usage crosses the warning (default 80%) and
 * exceeded (100%) thresholds.
 *
 * Design notes:
 * - We do NOT recompute every budget on every request. Instead, when a
 *   transaction changes we only recalculate the single budget that matches
 *   the affected (category, month, year). This is a targeted aggregation
 *   scoped to one category + one month, which is cheap and index-backed.
 * - `lastNotifiedLevel` (0=none, 1=warning, 2=exceeded) prevents duplicate
 *   notification spam while still allowing escalation (warning -> exceeded).
 */

const toId = (v) => {
    if (!v) return null;
    try {
        return new mongoose.Types.ObjectId(v);
    } catch {
        return null;
    }
};

/**
 * Returns the status bucket for a usage percentage.
 *  < warningThreshold        -> "safe"
 *  warningThreshold .. 100   -> "warning"
 *  > 100                     -> "exceeded"
 */
function getBudgetStatus(percentage, warningThreshold = 80) {
    if (percentage > 100) return "exceeded";
    if (percentage >= warningThreshold) return "warning";
    return "safe";
}

async function invalidateBudgetCache(userId) {
    await markFinancialDataChanged(userId);
    if (!redis) return;
    try {
        await redis.del(`budgets:${userId}`);
        await markBudgetChanged(userId);
    } catch (err) {
        console.warn("Budget cache invalidation error:", err.message);
    }
}

/**
 * Compute the total expense for a given user/category/month/year.
 * Targeted aggregation (single category, single month window).
 */
async function computeCategorySpend(userId, categoryId, month, year) {
    const uid = toId(userId);
    const cid = toId(categoryId);
    if (!uid || !cid || !month || !year) return 0;

    const result = await Transaction.aggregate([
        {
            $match: {
                user: uid,
                category: cid,
                type: "expense",
                isDeleted: false,
                date: {
                    $gte: new Date(Date.UTC(year, month - 1, 1)),
                    $lte: new Date(Date.UTC(year, month, 0, 23, 59, 59, 999))
                }
            }
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    return result[0]?.total || 0;
}

/**
 * Evaluate a budget's spend, persist tracking fields, and emit notifications
 * when warning/exceeded thresholds are newly crossed.
 *
 * @param {Object} budget - a Budget mongoose document
 * @returns {Object} the updated budget document
 */
async function evaluateBudget(budget) {
    if (!budget) return null;

    const limit = budget.limit || 0;
    const spent = await computeCategorySpend(budget.user, budget.category, budget.month, budget.year);
    const percentage = limit > 0 ? (spent / limit) * 100 : 0;
    const threshold = budget.warningThreshold || 80;
    const status = getBudgetStatus(percentage, threshold);

    budget.spentAmount = spent;
    budget.exceeded = percentage > 100;

    // Determine the alert level this evaluation represents.
    const level = status === "exceeded" ? 2 : status === "warning" ? 1 : 0;

    // Only notify when escalating to a new, higher level (avoids spam).
    if (level > (budget.lastNotifiedLevel || 0)) {
        await emitBudgetNotification(budget, status, spent, limit);
        budget.lastNotifiedLevel = level;
    } else if (level < (budget.lastNotifiedLevel || 0)) {
        // Spend dropped back below a threshold (e.g. txn deleted) — reset so
        // the user is alerted again if they cross it later.
        budget.lastNotifiedLevel = level;
    }

    await budget.save();
    return budget;
}

async function emitBudgetNotification(budget, status, spent, limit) {
    try {
        // Resolve category name for a friendlier message.
        const populated = await budget.populate({ path: "category", select: "name" });
        const categoryName = populated.category?.name || "this category";

        let message;
        if (status === "exceeded") {
            const over = Math.round((spent - limit) * 100) / 100;
            message = `Your ${categoryName} budget exceeded by ₹${over.toLocaleString("en-IN")}.`;
        } else if (status === "warning") {
            const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
            message = `You have used ${pct}% of your ${categoryName} budget.`;
        } else {
            return; // no notification for "safe"
        }

        const notification = await Notification.create({
            user: budget.user,
            type: "BUDGET_WARNING",
            message,
            metadata: {
                budgetId: budget._id,
                category: budget.category,
                month: budget.month,
                year: budget.year,
                spent,
                limit,
                status
            }
        });
        sendNotificationToUser(budget.user, notification);
    } catch (err) {
        console.warn("Budget notification error:", err.message);
    }
}

/**
 * Recalculate the single budget matching (user, category, month, year).
 * Called after a transaction mutation. No-op if no matching budget exists.
 */
async function syncBudgetForTransaction(userId, categoryId, date) {
    try {
        if (!userId || !categoryId || !date) return;
        const d = new Date(date);
        const month = d.getUTCMonth() + 1;
        const year = d.getUTCFullYear();

        const budget = await Budget.findOne({
            user: toId(userId),
            category: toId(categoryId),
            month,
            year,
            isDeleted: false
        });

        if (!budget) return; // nothing to track for this category/month

        await evaluateBudget(budget);
        await invalidateBudgetCache(userId);
    } catch (err) {
        console.warn("syncBudgetForTransaction error:", err.message);
    }
}

/**
 * Handle a transaction update which may move it between categories/months.
 * Recalculates both the old and new buckets.
 */
async function syncBudgetsForTransactionChange(userId, oldCategory, oldDate, newCategory, newDate) {
    const buckets = new Map();
    const add = (cat, date) => {
        if (!cat || !date) return;
        const d = new Date(date);
        buckets.set(`${cat.toString()}-${d.getUTCMonth() + 1}-${d.getUTCFullYear()}`, { cat, date: d });
    };
    add(oldCategory, oldDate);
    add(newCategory, newDate);

    for (const { cat, date } of buckets.values()) {
        await syncBudgetForTransaction(userId, cat, date);
    }
}

module.exports = {
    getBudgetStatus,
    computeCategorySpend,
    evaluateBudget,
    syncBudgetForTransaction,
    syncBudgetsForTransactionChange,
    invalidateBudgetCache
};
