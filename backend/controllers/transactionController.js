const Transaction = require("../models/Transaction");
const User = require("../models/user");
const redis = require("../config/redis");
const { invalidateUserSearchCache } = require("../utils/lruCache");
const Budget = require("../models/budget");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");
const budgetService = require("../services/budgetService");
const sagaService = require("../services/saga.service");
const { markFinancialDataChanged, versionedCacheGet, getFinancialVersion } = require("../utils/cacheHelpers");

async function wipeTransactionDependentCaches(userId) {
    // Just bump the version counter — all analytics endpoints use version-based
    // caching, so stale data is detected on the next read without needing to
    // eagerly scan and delete keys (avoids expensive redis.keys() calls).
    await markFinancialDataChanged(userId);
    if (redis) {
        try {
            // Only delete transaction list caches (deterministic key)
            await redis.del(`transactions:${userId}:list`);
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

        // Handle wallet payment for expenses via atomic saga
        if (type === 'expense' && paymentMethod === 'wallet') {
            const user = await User.findById(req.user._id);
            if (!user || user.walletBalance < parsedAmount) {
                return res.status(400).json({success: false, message: "Insufficient wallet balance"});
            }

            const transaction = await sagaService.runWalletExpenseSaga(
                req.user._id,
                parsedAmount,
                category,
                description,
                date
            );

            const populatedTransaction = await Transaction.findById(transaction._id).populate("category");
            
            if (description) {
                invalidateUserSearchCache(req.user._id);
            }

            await wipeTransactionDependentCaches(req.user._id);

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

            return res.status(201).json({success: true, message: "Transaction created", data: populatedTransaction});
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
        const userId = req.user._id;
        const queryString = new URLSearchParams(req.query).toString();
        const cacheKey = `transactions:${userId}:${queryString}`;
        const fv = await getFinancialVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, fv, async () => {
            const page = parseInt(req.query.page) || 1;
            const limit = parseInt(req.query.limit) || 10;
            const skip = (page - 1) * limit;
            const {type, category, startDate, endDate, sortBy, sortOrder, search} = req.query;
            
            let filter = {user: userId, isDeleted: false};
            
            if (type) filter.type = type;
            if (category) filter.category = category;
            if (startDate || endDate) {
                filter.date = {};
                if (startDate) filter.date.$gte = new Date(startDate);
                if (endDate) filter.date.$lte = new Date(endDate);
            }
            
            // Search across description and amount
            if (search && search.trim()) {
                const searchRegex = new RegExp(search.trim(), 'i');
                filter.$or = [
                    { description: searchRegex },
                    { amount: isNaN(search) ? undefined : parseFloat(search) }
                ].filter(Boolean);
            }
            
            let sort = {};
            if (sortBy) {
                sort[sortBy] = sortOrder === 'asc' ? 1 : -1;
                if (sortBy !== 'createdAt') {
                    sort.createdAt = -1;
                }
            } else {
                sort = {date: -1, createdAt: -1};
            }
            
            const transactions = await Transaction.find(filter)
                .populate("category")
                .sort(sort)
                .skip(skip)
                .limit(limit);
                
            const total = await Transaction.countDocuments(filter);
            
            return {
                transactions,
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            };
        }, 300);

        res.json({success: true, message: "Transactions retrieved", data});
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
        console.error("Restore transaction error:", error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.bulkAddTransactions = async (req, res) => {
    try {
        const { transactions } = req.body;
        if (!transactions || !Array.isArray(transactions) || transactions.length === 0) {
            return res.status(400).json({ success: false, message: "Invalid request data. Expected non-empty transactions array." });
        }

        // Validate each transaction in the array
        for (let i = 0; i < transactions.length; i++) {
            const { amount, type, category } = transactions[i];
            if (!amount || !type || !category) {
                return res.status(400).json({ success: false, message: `Row ${i + 1}: Amount, type, and category are required` });
            }
            if (!['income', 'expense'].includes(type)) {
                return res.status(400).json({ success: false, message: `Row ${i + 1}: Type must be either income or expense` });
            }
            const parsedAmount = parseFloat(amount);
            if (isNaN(parsedAmount) || parsedAmount <= 0) {
                return res.status(400).json({ success: false, message: `Row ${i + 1}: Amount must be a positive number` });
            }
        }

        const createdTransactions = [];
        const uniqueCategoryMonths = new Map();

        for (const txn of transactions) {
            const parsedAmount = parseFloat(txn.amount);
            const dateVal = txn.date ? new Date(txn.date) : new Date();
            const created = await Transaction.create({
                amount: parsedAmount,
                type: txn.type,
                category: txn.category,
                description: txn.description || '',
                date: dateVal,
                user: req.user._id
            });
            createdTransactions.push(created);

            if (txn.type === 'expense') {
                const year = dateVal.getFullYear();
                const month = dateVal.getMonth();
                const key = `${txn.category}_${year}_${month}`;
                uniqueCategoryMonths.set(key, { category: txn.category, date: dateVal });
            }
        }

        // Populate category details for all created transactions
        const populatedTransactions = await Transaction.find({
            _id: { $in: createdTransactions.map(t => t._id) }
        }).populate("category");

        // Sync budgets for affected categories/months
        for (const [_, item] of uniqueCategoryMonths) {
            await budgetService.syncBudgetForTransaction(req.user._id, item.category, item.date);
        }

        // Invalidate caches
        invalidateUserSearchCache(req.user._id);
        await wipeTransactionDependentCaches(req.user._id);

        // --- Notification ---
        try {
            const count = populatedTransactions.length;
            const notif = await Notification.create({
                user: req.user._id,
                type: "TRANSACTION_CREATED",
                message: `Logged ${count} new transaction${count !== 1 ? 's' : ''} in bulk.`
            });
            sendNotificationToUser(req.user._id, notif);
        } catch (_) {}

        return res.status(201).json({
            success: true,
            message: `Successfully logged ${populatedTransactions.length} transactions`,
            data: populatedTransactions
        });
    } catch (error) {
        console.error("Bulk transaction creation error:", error);
        res.status(500).json({ success: false, message: "Server error during bulk transaction logging" });
    }
};

exports.exportTransactionsPDF = async (req, res) => {
    // Placeholder for PDF export logic
    res.status(200).json({ success: true, message: "PDF exported successfully (stub)" });
};
