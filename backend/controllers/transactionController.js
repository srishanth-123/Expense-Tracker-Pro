const Transaction = require("../models/Transaction");
const User = require("../models/user");
const WalletTransaction = require("../models/WalletTransaction");
const redis = require("../config/redis");
const { invalidateUserSearchCache } = require("../utils/lruCache");
const Budget = require("../models/budget");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");
const budgetService = require("../services/budgetService");

async function wipeTransactionDependentCaches(userId) {
    if (redis) {
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
            console.warn("Redis invalidation error:", err.message);
        }
    }

}

exports.addTransaction=async(req,res)=>{
    try {
        const {amount, type, category, description, date, paymentMethod} = req.body;
        
        if (!amount || !type || !category) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        if (!['income', 'expense'].includes(type)) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        const parsedAmount = parseFloat(amount);

        // Handle wallet payment for expenses
        if (type === 'expense' && paymentMethod === 'wallet') {
            const user = await User.findById(req.user._id);
            if (!user || user.walletBalance < parsedAmount) {
                return res.status(400).json({success: false, message: "Insufficient wallet balance"});
            }

            // Deduct from wallet
            await User.findByIdAndUpdate(req.user._id, { $inc: { walletBalance: -parsedAmount } });

            // Create wallet transaction log
            await WalletTransaction.create({
                user: req.user._id,
                type: 'debit',
                amount: parsedAmount,
                source: 'expense',
                status: 'success',
                referenceId: `EXP-${Date.now()}`,
                description: description || 'Expense payment'
            });
        }
        
        const transaction=await Transaction.create({
            amount: parsedAmount,
            type,
            category,
            description: description || '',
            date: date ? new Date(date) : new Date(),
            user:req.user._id
        });
        
        const populatedTransaction = await Transaction.findById(transaction._id).populate("category");
        
        if (description) {
            invalidateUserSearchCache(req.user._id);
        }

        await wipeTransactionDependentCaches(req.user._id);

        // --- Budget tracking: recalc the affected category/month budget ---
        if (type === "expense") {
            await budgetService.syncBudgetForTransaction(req.user._id, category, date ? new Date(date) : new Date());
        }
        // -----------------------------------------

        // --- Notification ---
        try {
            const catName = populatedTransaction.category?.name || 'Uncategorized';
            const notif = await Notification.create({
                user: req.user._id,
                type: "TRANSACTION_CREATED",
                message: `New ${type}: ₹${parsedAmount} in ${catName}${description ? ' — ' + description : ''}`
            });
            sendNotificationToUser(req.user._id, notif);
        } catch (_) {}

        res.status(201).json({success: true, message: "Transaction created", data: populatedTransaction});
    } catch (error) {
        console.error('Add transaction error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.getTransactions=async(req,res)=>{
    try {
        const queryString = new URLSearchParams(req.query).toString();
        const cacheKey = `transactions:${req.user._id}:${queryString}`;
        
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
                    if (data) return res.json({success: true, message: "Transactions retrieved", data: data});
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

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const {type, category, startDate, endDate, sortBy, sortOrder, search} = req.query;
        
        let filter = {user: req.user._id, isDeleted: false};
        
        if (type) filter.type = type;
        if (category) filter.category = category;
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
        }
        
        // Search across description, amount, type
        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            filter.$or = [
                { description: searchRegex },
                { amount: isNaN(search) ? undefined : parseFloat(search) },
                { type: searchRegex }
            ].filter(Boolean);
        }
        
        let sort = {date: -1};
        if (sortBy) {
            sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
        }
        
        const transactions = await Transaction.find(filter)
            .populate("category")
            .sort(sort)
            .skip(skip)
            .limit(limit);
            
        const total = await Transaction.countDocuments(filter);
        
        const result = {
            transactions,
            page,
            limit,
            total,
            pages: Math.ceil(total / limit)
        };

        if (redis) {
            try {
                await redis.set(cacheKey, JSON.stringify(result), { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Transactions retrieved", data: result});
    } catch (error) {
        console.error('Get transactions error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.updateTransaction=async(req,res)=>{
    try {
        const {amount, type, category, description, date} = req.body;
        
        const transaction = await Transaction.findById(req.params.id);
        const oldDescription = transaction ? transaction.description : null;
        const oldCategory = transaction ? transaction.category : null;
        const oldDate = transaction ? transaction.date : null;
        const oldType = transaction ? transaction.type : null;

        
        if (!transaction || transaction.isDeleted) {
            return res.status(404).json({success: false, message: "Resource not found"});
        }
        
        if (transaction.user.toString() !== req.user._id.toString()) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        if (amount && (isNaN(amount) || amount <= 0)) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        if (type && !['income', 'expense'].includes(type)) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        const updateData = {};
        if (amount !== undefined) updateData.amount = parseFloat(amount);
        if (type !== undefined) updateData.type = type;
        if (category !== undefined) updateData.category = category;
        if (description !== undefined) updateData.description = description;
        if (date !== undefined) updateData.date = new Date(date);
        
        const updatedTransaction = await Transaction.findByIdAndUpdate(
            req.params.id,
            updateData,
            {new: true, runValidators: true}
        ).populate("category");
        
        if (description !== undefined && description !== oldDescription) {
            invalidateUserSearchCache(req.user._id);
        }
        
        await wipeTransactionDependentCaches(req.user._id);

        // --- Budget tracking: recalc both old and new category/month buckets ---
        if (oldType === "expense" || updatedTransaction.type === "expense") {
            await budgetService.syncBudgetsForTransactionChange(
                req.user._id,
                oldCategory,
                oldDate,
                updatedTransaction.category?._id || updatedTransaction.category,
                updatedTransaction.date
            );
        }
        // -----------------------------------------

        // --- Notification ---
        try {
            const catName = updatedTransaction.category?.name || 'Uncategorized';
            const notif = await Notification.create({
                user: req.user._id,
                type: "TRANSACTION_UPDATED",
                message: `Updated ${updatedTransaction.type}: ₹${updatedTransaction.amount} in ${catName}`
            });
            sendNotificationToUser(req.user._id, notif);
        } catch (_) {}

        res.json({success: true, message: "Transaction updated", data: updatedTransaction});
    } catch (error) {
        console.error('Update transaction error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.deleteTransaction=async(req,res)=>{
    try {
        const transaction = await Transaction.findById(req.params.id);
        
        if (!transaction || transaction.isDeleted) {
            return res.status(404).json({success: false, message: "Resource not found"});
        }
        
        if (transaction.user.toString() !== req.user._id.toString()) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        await Transaction.findByIdAndUpdate(req.params.id, { isDeleted: true, deletedAt: new Date() });
        
        if (transaction.description) {
            invalidateUserSearchCache(req.user._id);
        }

        await wipeTransactionDependentCaches(req.user._id);

        // --- Budget tracking: recalc the affected category/month budget ---
        if (transaction.type === "expense") {
            await budgetService.syncBudgetForTransaction(req.user._id, transaction.category, transaction.date);
        }
        // -----------------------------------------

        // --- Notification ---
        try {
            const notif = await Notification.create({
                user: req.user._id,
                type: "TRANSACTION_DELETED",
                message: `Deleted ${transaction.type}: ₹${transaction.amount}${transaction.description ? ' — ' + transaction.description : ''}`
            });
            sendNotificationToUser(req.user._id, notif);
        } catch (_) {}

        res.json({success: true, message:"Transaction deleted successfully"});
    } catch (error) {
        console.error('Delete transaction error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.getTransactionById=async(req,res)=>{
    try {
        const transaction = await Transaction.findById(req.params.id).populate("category");
        
        if (!transaction || transaction.isDeleted) {
            return res.status(404).json({success: false, message: "Resource not found"});
        }
        
        if (transaction.user.toString() !== req.user._id.toString()) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        res.json({success: true, message: "Transaction retrieved", data: transaction});
    } catch (error) {
        console.error('Get transaction by ID error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.restoreTransaction = async(req, res) => {
    try {
        const transaction = await Transaction.findById(req.params.id);
        
        if (!transaction) {
            return res.status(404).json({success: false, message: "Resource not found"});
        }
        
        if (transaction.user.toString() !== req.user._id.toString()) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        if (!transaction.isDeleted) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        await Transaction.findByIdAndUpdate(req.params.id, { isDeleted: false, deletedAt: null });
        
        if (transaction.description) {
            invalidateUserSearchCache(req.user._id);
        }

        await wipeTransactionDependentCaches(req.user._id);

        // --- Budget tracking: recalc the affected category/month budget ---
        if (transaction.type === "expense") {
            await budgetService.syncBudgetForTransaction(req.user._id, transaction.category, transaction.date);
        }
        // -----------------------------------------

        // --- Notification ---
        try {
            const notif = await Notification.create({
                user: req.user._id,
                type: "TRANSACTION_RESTORED",
                message: `Restored ${transaction.type}: ₹${transaction.amount}${transaction.description ? ' — ' + transaction.description : ''}`
            });
            sendNotificationToUser(req.user._id, notif);
        } catch (_) {}

        res.json({success: true, message: "Transaction restored successfully"});
    } catch (error) {
        console.error('Restore transaction error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};
