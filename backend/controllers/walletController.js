const User = require("../models/user");
const WalletTransaction = require("../models/WalletTransaction");

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

exports.getHistory = async (req, res) => {
    try {
        const history = await WalletTransaction.find({ user: req.user._id }).sort({ createdAt: -1 });
        res.json({success: true, message: "Success", data: history});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};
