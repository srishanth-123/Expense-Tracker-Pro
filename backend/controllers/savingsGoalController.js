const SavingsGoal = require("../models/SavingsGoal");
const User = require("../models/user");
const WalletTransaction = require("../models/WalletTransaction");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");
const logger = require("../utils/logger");

// ─── Get All Savings Goals ────────────────────────────────────────────────────
exports.getSavingsGoals = async (req, res) => {
    try {
        const goals = await SavingsGoal.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json({ success: true, message: "Savings goals retrieved", data: goals });
    } catch (error) {
        logger.error("Get savings goals error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Create Savings Goal ──────────────────────────────────────────────────────
exports.createSavingsGoal = async (req, res) => {
    try {
        const { name, targetAmount, deadline, icon, color } = req.body;

        if (!name || !targetAmount) {
            return res.status(400).json({ success: false, message: "Name and target amount are required" });
        }

        const parsedTarget = parseFloat(targetAmount);
        if (isNaN(parsedTarget) || parsedTarget < 1) {
            return res.status(400).json({ success: false, message: "Target amount must be at least ₹1" });
        }

        const goal = await SavingsGoal.create({
            user: req.user._id,
            name: name.trim(),
            targetAmount: parsedTarget,
            deadline: deadline ? new Date(deadline) : null,
            icon: icon || "🎯",
            color: color || "#6366f1"
        });

        res.status(201).json({ success: true, message: "Savings goal created", data: goal });
    } catch (error) {
        logger.error("Create savings goal error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Update Savings Goal ──────────────────────────────────────────────────────
exports.updateSavingsGoal = async (req, res) => {
    try {
        const goal = await SavingsGoal.findById(req.params.id);
        if (!goal) return res.status(404).json({ success: false, message: "Goal not found" });
        if (goal.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const allowedFields = ["name", "targetAmount", "deadline", "icon", "color"];
        const updateData = {};
        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updateData[field] = req.body[field];
            }
        }

        if (updateData.targetAmount) updateData.targetAmount = parseFloat(updateData.targetAmount);
        if (updateData.deadline) updateData.deadline = new Date(updateData.deadline);
        if (updateData.name) updateData.name = updateData.name.trim();

        const updated = await SavingsGoal.findByIdAndUpdate(req.params.id, updateData, { new: true, runValidators: true });
        res.json({ success: true, message: "Savings goal updated", data: updated });
    } catch (error) {
        logger.error("Update savings goal error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Delete Savings Goal ──────────────────────────────────────────────────────
exports.deleteSavingsGoal = async (req, res) => {
    try {
        const goal = await SavingsGoal.findById(req.params.id);
        if (!goal) return res.status(404).json({ success: false, message: "Goal not found" });
        if (goal.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        // Refund any saved amount back to wallet
        if (goal.currentAmount > 0) {
            await User.findByIdAndUpdate(req.user._id, { $inc: { walletBalance: goal.currentAmount } });
            await WalletTransaction.create({
                user: req.user._id,
                type: "credit",
                amount: goal.currentAmount,
                source: "savings_refund",
                status: "success",
                referenceId: `GOAL-REFUND-${goal._id}`,
                description: `Refund from deleted savings goal: ${goal.name}`
            });
        }

        await SavingsGoal.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: "Savings goal deleted" + (goal.currentAmount > 0 ? ` — ₹${goal.currentAmount} refunded to wallet` : "") });
    } catch (error) {
        logger.error("Delete savings goal error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Contribute to Savings Goal (from wallet) ────────────────────────────────
exports.contributeToGoal = async (req, res) => {
    try {
        const { amount } = req.body;
        const parsedAmount = parseFloat(amount);

        if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ success: false, message: "Amount must be a positive number" });
        }

        const goal = await SavingsGoal.findById(req.params.id);
        if (!goal) return res.status(404).json({ success: false, message: "Goal not found" });
        if (goal.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        if (goal.isCompleted) {
            return res.status(400).json({ success: false, message: "This goal is already completed" });
        }

        // Cap contribution at remaining amount needed
        const remaining = goal.targetAmount - goal.currentAmount;
        const contribution = Math.min(parsedAmount, remaining);

        // Deduct from wallet atomically
        const user = await User.findOneAndUpdate(
            { _id: req.user._id, walletBalance: { $gte: contribution } },
            { $inc: { walletBalance: -contribution } },
            { new: true }
        );

        if (!user) {
            return res.status(400).json({ success: false, message: "Insufficient wallet balance" });
        }

        // Update goal
        goal.currentAmount = Math.round((goal.currentAmount + contribution) * 100) / 100;
        if (goal.currentAmount >= goal.targetAmount) {
            goal.isCompleted = true;
            goal.completedAt = new Date();
        }
        await goal.save();

        // Create wallet transaction log
        await WalletTransaction.create({
            user: req.user._id,
            type: "debit",
            amount: contribution,
            source: "savings",
            status: "success",
            referenceId: `GOAL-${goal._id}`,
            description: `Savings: ${goal.name}`
        });

        // Send notification on completion
        if (goal.isCompleted) {
            try {
                const notif = await Notification.create({
                    user: req.user._id,
                    type: "SYSTEM",
                    message: `🎉 Congratulations! You completed your savings goal "${goal.name}" (₹${goal.targetAmount})!`
                });
                sendNotificationToUser(req.user._id, notif);
            } catch (_) {}
        }

        res.json({
            success: true,
            message: goal.isCompleted ? `Goal completed! ₹${contribution} added.` : `₹${contribution} added to "${goal.name}"`,
            data: goal
        });
    } catch (error) {
        logger.error("Contribute to savings goal error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Withdraw from Savings Goal (back to wallet) ─────────────────────────────
exports.withdrawFromGoal = async (req, res) => {
    try {
        const { amount } = req.body;
        const parsedAmount = parseFloat(amount);

        if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
            return res.status(400).json({ success: false, message: "Amount must be a positive number" });
        }

        const goal = await SavingsGoal.findById(req.params.id);
        if (!goal) return res.status(404).json({ success: false, message: "Goal not found" });
        if (goal.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Unauthorized" });
        }

        const withdrawal = Math.min(parsedAmount, goal.currentAmount);
        if (withdrawal <= 0) {
            return res.status(400).json({ success: false, message: "No savings to withdraw" });
        }

        // Credit wallet
        await User.findByIdAndUpdate(req.user._id, { $inc: { walletBalance: withdrawal } });

        // Update goal
        goal.currentAmount = Math.round((goal.currentAmount - withdrawal) * 100) / 100;
        if (goal.isCompleted && goal.currentAmount < goal.targetAmount) {
            goal.isCompleted = false;
            goal.completedAt = null;
        }
        await goal.save();

        // Wallet log
        await WalletTransaction.create({
            user: req.user._id,
            type: "credit",
            amount: withdrawal,
            source: "savings_withdrawal",
            status: "success",
            referenceId: `GOAL-WD-${goal._id}`,
            description: `Withdrew from savings: ${goal.name}`
        });

        res.json({ success: true, message: `₹${withdrawal} withdrawn from "${goal.name}" to wallet`, data: goal });
    } catch (error) {
        logger.error("Withdraw from savings goal error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
