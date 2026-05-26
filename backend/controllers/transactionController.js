const Transaction = require("../models/Transaction");
const searchRegistry = require("../utils/trie");
const redis = require("../config/redis");
const { invalidateUserSearchCache } = require("../utils/lruCache");
const Budget = require("../models/budget");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");

async function wipeTransactionDependentCaches(userId) {
    if (redis) {
        try {
            const analyticsKeys = await redis.keys(`analytics:*:${userId}`);
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
        const {amount, type, category, description, date} = req.body;
        
        if (!amount || !type || !category) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        if (!['income', 'expense'].includes(type)) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        if (isNaN(amount) || amount <= 0) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        const transaction=await Transaction.create({
            amount: parseFloat(amount),
            type,
            category,
            description: description || '',
            date: date ? new Date(date) : new Date(),
            user:req.user._id
        });
        
        const populatedTransaction = await Transaction.findById(transaction._id).populate("category");
        
        if (description) {
            searchRegistry.getTrie(req.user._id).insert(description, {
                id: transaction._id,
                text: description,
                type: 'transaction'
            });
            invalidateUserSearchCache(req.user._id);
        }

        await wipeTransactionDependentCaches(req.user._id);

        // --- Budget Check & Notification Logic ---
        if (type === "expense") {
            const txDate = date ? new Date(date) : new Date();
            const currentMonth = txDate.getMonth() + 1;
            const currentYear = txDate.getFullYear();

            // Check if there is an active budget for this category and month
            const budget = await Budget.findOne({
                user: req.user._id,
                category: category,
                month: currentMonth,
                year: currentYear,
                isDeleted: false
            });

            if (budget) {
                // Calculate total spent for this category this month
                const spent = await Transaction.aggregate([
                    {
                        $match: {
                            user: req.user._id,
                            category: budget.category,
                            type: "expense",
                            date: {
                                $gte: new Date(currentYear, currentMonth - 1, 1),
                                $lte: new Date(currentYear, currentMonth, 0)
                            },
                            isDeleted: false
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            total: { $sum: "$amount" }
                        }
                    }
                ]);

                const totalSpent = spent[0]?.total || 0;
                
                // If it just exceeded or is nearing the limit, we can notify
                // For simplicity: notify if totalSpent > budget.limit 
                // We'll notify if this exact transaction pushed it over the limit, to avoid spam
                const previousSpent = totalSpent - parseFloat(amount);
                
                if (totalSpent > budget.limit && previousSpent <= budget.limit) {
                    const notification = await Notification.create({
                        user: req.user._id,
                        type: "BUDGET_WARNING",
                        message: `You've exceeded your ${budget.limit} INR budget for this category!`
                    });
                    sendNotificationToUser(req.user._id, notification);
                } else if (totalSpent >= budget.limit * 0.9 && previousSpent < budget.limit * 0.9) {
                    const notification = await Notification.create({
                        user: req.user._id,
                        type: "BUDGET_WARNING",
                        message: `You've reached 90% of your budget for this category!`
                    });
                    sendNotificationToUser(req.user._id, notification);
                }
            }
        }
        // -----------------------------------------

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
                if (cached) return res.json({success: true, message: "Transactions retrieved", data: JSON.parse(cached)});
            } catch (err) {
                console.warn("Redis GET error:", err.message);
            }
        }

        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const {type, category, startDate, endDate, sortBy, sortOrder} = req.query;
        
        let filter = {user: req.user._id, isDeleted: false};
        
        if (type) filter.type = type;
        if (category) filter.category = category;
        if (startDate || endDate) {
            filter.date = {};
            if (startDate) filter.date.$gte = new Date(startDate);
            if (endDate) filter.date.$lte = new Date(endDate);
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
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
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
            const trie = searchRegistry.getTrie(req.user._id);
            if (oldDescription) {
                trie.remove(oldDescription, transaction._id);
            }
            if (description) {
                trie.insert(description, {
                    id: transaction._id,
                    text: description,
                    type: 'transaction'
                });
            }
            invalidateUserSearchCache(req.user._id);
        }
        
        await wipeTransactionDependentCaches(req.user._id);

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
            searchRegistry.getTrie(req.user._id).remove(transaction.description, transaction._id);
            invalidateUserSearchCache(req.user._id);
        }

        await wipeTransactionDependentCaches(req.user._id);

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
            searchRegistry.getTrie(req.user._id).insert(transaction.description, {
                id: transaction._id,
                text: transaction.description,
                type: 'transaction'
            });
            invalidateUserSearchCache(req.user._id);
        }

        await wipeTransactionDependentCaches(req.user._id);

        res.json({success: true, message: "Transaction restored successfully"});
    } catch (error) {
        console.error('Restore transaction error:', error);
        res.status(500).json({success: false, message: "Server error"});
    }
};
