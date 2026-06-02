const User = require("../models/user");
const WalletTransaction = require("../models/WalletTransaction");
const sagaService = require("../services/saga.service");

exports.addBalance = async (req, res) => {
    try {
        const { amount, referenceId } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        const walletTransaction = await WalletTransaction.create({
            user: req.user._id,
            type: "credit",
            amount,
            source: "upi",
            status: "success", 
            referenceId: referenceId || `UPI-${Date.now()}`
        });

        const user = await User.findByIdAndUpdate(
            req.user._id, 
            { $inc: { walletBalance: amount } }, 
            { new: true }
        );

        res.json({success: true, message: "Balance added successfully",
            walletBalance: user.walletBalance,
            transaction: walletTransaction
        });
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.getBalance = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        res.json({success: true, message: "Success", data: { walletBalance: user.walletBalance || 0 }});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.withdrawFunds = async (req, res) => {
    try {
        const { amount, upiId } = req.body;
        const userId = req.user._id;

        if (!amount || isNaN(amount) || Number(amount) < 100) {
            return res.status(400).json({ success: false, message: "Minimum withdrawal amount is ₹100." });
        }

        if (!upiId || !upiId.trim()) {
            return res.status(400).json({ success: false, message: "A valid UPI ID is required for withdrawal." });
        }

        const user = await User.findById(userId).select("walletBalance");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        if (user.walletBalance < Number(amount)) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient wallet balance. You tried to withdraw ₹${amount}, but only have ₹${user.walletBalance.toFixed(2)}.` 
            });
        }

        // Run withdrawal saga
        await sagaService.runWalletWithdrawalSaga(userId, Number(amount), upiId.trim());

        // Fetch updated user to get new balance
        const updatedUser = await User.findById(userId).select("walletBalance");

        res.json({
            success: true,
            message: "Withdrawal processed successfully!",
            data: {
                amount: Number(amount),
                walletBalance: updatedUser.walletBalance
            }
        });
    } catch (error) {
        console.error("Wallet withdrawal error:", error);
        res.status(500).json({ success: false, message: error.message || "Server error during withdrawal." });
    }
};

exports.getHistory = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const history = await WalletTransaction.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await WalletTransaction.countDocuments({ user: req.user._id });

        res.json({
            success: true,
            message: "Success",
            data: {
                transactions: history,
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};
