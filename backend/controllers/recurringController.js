const RecurringTransaction = require("../models/RecurringTransaction");
const Transaction = require("../models/Transaction");
const budgetService = require("../services/budgetService");
const { markFinancialDataChanged } = require("../utils/cacheHelpers");
const logger = require("../utils/logger");

// ─── Get All Recurring Transactions ───────────────────────────────────────────
exports.getRecurringTransactions = async (req, res) => {
    try {
        const recurring = await RecurringTransaction.find({ user: req.user._id })
            .populate("category")
            .sort({ createdAt: -1 });
        res.json({ success: true, message: "Recurring transactions retrieved", data: recurring });
    } catch (error) {
        logger.error("Get recurring transactions error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Create Recurring Transaction ─────────────────────────────────────────────
exports.createRecurringTransaction = async (req, res) => {
    try {
        const { type, amount, category, description, frequency, startDate, endDate } = req.body;

        if (!type || !amount || !category || !frequency) {
            return res.status(400).json({ success: false, message: "Type, amount, category, and frequency are required" });
        }

        if (!["income", "expense"].includes(type)) {
            return res.status(400).json({ success: false, message: "Type must be income or expense" });
        }

        if (!["daily", "weekly", "monthly", "yearly"].includes(frequency)) {
            return res.status(400).json({ success: false, message: "Frequency must be daily, weekly, monthly, or yearly" });
        }

        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ success: false, message: "Amount must be a positive number" });
        }

        const start = startDate ? new Date(startDate) : new Date();

        const recurring = await RecurringTransaction.create({
            user: req.user._id,
            type,
            amount: parsedAmount,
            category,
            description: description || "",
            frequency,
            startDate: start,
            endDate: endDate ? new Date(endDate) : null,
            nextRunDate: start
        });

        const populated = await RecurringTransaction.findById(recurring._id).populate("category");
        res.status(201).json({ success: true, message: "Recurring transaction created", data: populated });
    } catch (error) {
        logger.error("Create recurring transaction error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Update Recurring Transaction ─────────────────────────────────────────────
exports.updateRecurringTransaction = async (req, res) => {
    try {
        const recurring = await RecurringTransaction.findById(req.params.id);
        if (!recurring) return res.status(404).json({ success: false, message: "Not found" });
        if (recurring.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const allowedFields = ["type", "amount", "category", "description", "frequency", "startDate", "endDate", "isActive"];
        const updateData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        if (updateData.amount) updateData.amount = parseFloat(updateData.amount);
        if (updateData.startDate) updateData.startDate = new Date(updateData.startDate);
        if (updateData.endDate) updateData.endDate = new Date(updateData.endDate);

        const updated = await RecurringTransaction.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true }).populate("category");
        res.json({ success: true, message: "Recurring transaction updated", data: updated });
    } catch (error) {
        logger.error("Update recurring transaction error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Delete Recurring Transaction ─────────────────────────────────────────────
exports.deleteRecurringTransaction = async (req, res) => {
    try {
        const recurring = await RecurringTransaction.findById(req.params.id);
        if (!recurring) return res.status(404).json({ success: false, message: "Not found" });
        if (recurring.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        await RecurringTransaction.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Recurring transaction deleted" });
    } catch (error) {
        logger.error("Delete recurring transaction error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Process Due Recurring Transactions (used by cron job) ────────────────────
exports.processDueRecurring = async () => {
    const now = new Date();
    const dueItems = await RecurringTransaction.find({
        isActive: true,
        nextRunDate: { $lte: now },
        $or: [
            { endDate: null },
            { endDate: { $gte: now } }
        ]
    });

    let created = 0;
    for (const item of dueItems) {
        try {
            // Create the actual transaction
            await Transaction.create({
                user: item.user,
                type: item.type,
                amount: item.amount,
                category: item.category,
                description: `[Auto] ${item.description || "Recurring transaction"}`,
                date: new Date(),
                isDeleted: false
            });

            // Sync budget if expense
            if (item.type === "expense") {
                await budgetService.syncBudgetForTransaction(item.user, item.category, new Date());
            }

            // Bump version counter for cache invalidation
            await markFinancialDataChanged(item.user);

            // Calculate next run date
            const next = new Date(item.nextRunDate);
            switch (item.frequency) {
                case "daily": next.setDate(next.getDate() + 1); break;
                case "weekly": next.setDate(next.getDate() + 7); break;
                case "monthly": next.setMonth(next.getMonth() + 1); break;
                case "yearly": next.setFullYear(next.getFullYear() + 1); break;
            }

            // If next run is past the end date, deactivate
            if (item.endDate && next > item.endDate) {
                item.isActive = false;
            }

            item.nextRunDate = next;
            item.lastRunDate = now;
            item.totalGenerated += 1;
            await item.save();
            created++;
        } catch (err) {
            logger.error(`[RECURRING] Failed to process recurring ${item._id}: ${err.message}`);
        }
    }

    return { processed: created, total: dueItems.length };
};
