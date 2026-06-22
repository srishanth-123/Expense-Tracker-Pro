const mongoose = require("mongoose");
const User = require("../models/user");
const WalletTransaction = require("../models/WalletTransaction");
const sagaService = require("../services/saga.service");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");
const idempotencyHandler = require("../utils/idempotency");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// NOTE: Wallet top-ups are intentionally NOT handled here. The only way to add
// funds is through the verified Razorpay flow (paymentController.verifyPayment →
// runWalletTopupSaga), which validates the payment signature before crediting.
// A direct "add balance" endpoint would let any authenticated user mint money.

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

exports.searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        const trimmed = (query || "").trim();
        if (trimmed.length < 1) {
            return res.json({ success: true, data: [] });
        }

        // Escape special regex characters to prevent RegExp injection / 500 errors
        const escaped = escapeRegex(trimmed);
        const regex = new RegExp(escaped, "i");
        const users = await User.find({
            _id: { $ne: req.user._id },
            $or: [{ email: regex }, { name: regex }]
        }).select("name email profilePicture").limit(10);

        res.json({ success: true, data: users });
    } catch (error) {
        console.error("User search error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.transferP2P = async (req, res) => {
    try {
        const { receiverId, amount, description } = req.body;
        const senderId = req.user._id;
        const transferAmount = Math.round(Number(amount) * 100) / 100;
        const idempotencyKey = req.headers["x-idempotency-key"] || req.body.idempotencyKey;

        if (!receiverId || !amount || isNaN(amount) || transferAmount <= 0) {
            return res.status(400).json({ success: false, message: "Valid receiver and amount are required." });
        }

        if (transferAmount > 100000) {
            return res.status(400).json({ success: false, message: "Maximum transfer amount is ₹1,00,000 per transaction." });
        }

        if (senderId.toString() === receiverId.toString()) {
            return res.status(400).json({ success: false, message: "Cannot transfer money to yourself." });
        }

        const receiver = await User.findById(receiverId).select("name email");
        if (!receiver) {
            return res.status(404).json({ success: false, message: "Receiver not found." });
        }

        const executeLogic = async () => {
            // The saga's atomic findOneAndUpdate with $gte is the authoritative balance check.
            // A pre-check here would be a race condition (two concurrent requests both pass, then both deduct).
            await sagaService.runP2PTransferSaga(senderId, receiverId, transferAmount, description);
            const updatedSender = await User.findById(senderId).select("walletBalance");
            return { walletBalance: updatedSender.walletBalance };
        };

        const result = await idempotencyHandler.checkOrExecute(idempotencyKey, executeLogic);

        res.json({
            success: true,
            message: "Transfer successful",
            data: result
        });
    } catch (error) {
        console.error("P2P Transfer error:", error);
        res.status(500).json({ success: false, message: error.message || "Server error during transfer" });
    }
};

exports.getWalletAnalytics = async (req, res) => {
    try {
        const userId = new mongoose.Types.ObjectId(req.user._id);

        // Total received and total sent over time
        const stats = await WalletTransaction.aggregate([
            { $match: { user: userId, status: "success" } },
            { 
                $group: { 
                    _id: "$type", 
                    totalAmount: { $sum: "$amount" },
                    count: { $sum: 1 }
                } 
            }
        ]);

        const analytics = {
            totalCredit: stats.find(s => s._id === "credit")?.totalAmount || 0,
            totalDebit: stats.find(s => s._id === "debit")?.totalAmount || 0,
            creditCount: stats.find(s => s._id === "credit")?.count || 0,
            debitCount: stats.find(s => s._id === "debit")?.count || 0,
        };

        // Source breakdown
        const sourceBreakdown = await WalletTransaction.aggregate([
            { $match: { user: userId, status: "success" } },
            {
                $group: {
                    _id: { type: "$type", source: "$source" },
                    amount: { $sum: "$amount" }
                }
            }
        ]);

        const formattedBreakdown = sourceBreakdown.map(b => ({
            type: b._id.type,
            source: b._id.source,
            amount: b.amount
        }));

        res.json({ success: true, data: { summary: analytics, breakdown: formattedBreakdown } });
    } catch (error) {
        console.error("Wallet analytics error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.exportStatement = async (req, res) => {
    try {
        const {
            format = "csv",
            type, // "all", "topups", "sent", "received", "splits", "withdrawals", "transfers"
            dateRange, // "7days", "30days", "3months", "6months", "custom"
            startDate,
            endDate,
            minAmount,
            maxAmount,
            counterparty,
            status // "all", "pending", "success", "failed"
        } = req.query;
        const userId = req.user._id;

        // 1. Build MongoDB Query
        const query = { user: userId };

        // Transaction Type Filter
        if (type && type !== "all") {
            if (type === "topups") {
                query.source = "topup";
            } else if (type === "sent") {
                query.source = "transfer";
                query.type = "debit";
            } else if (type === "received") {
                query.source = "transfer";
                query.type = "credit";
            } else if (type === "splits") {
                query.source = "split";
            } else if (type === "withdrawals") {
                query.source = "upi";
            } else if (type === "transfers") {
                query.source = "transfer";
            }
        }

        // Date Range Filter
        let calculatedStartDate = null;
        let calculatedEndDate = new Date();

        if (dateRange && dateRange !== "custom") {
            calculatedStartDate = new Date();
            if (dateRange === "7days") {
                calculatedStartDate.setDate(calculatedStartDate.getDate() - 7);
            } else if (dateRange === "30days") {
                calculatedStartDate.setDate(calculatedStartDate.getDate() - 30);
            } else if (dateRange === "3months") {
                calculatedStartDate.setMonth(calculatedStartDate.getMonth() - 3);
            } else if (dateRange === "6months") {
                calculatedStartDate.setMonth(calculatedStartDate.getMonth() - 6);
            }
            // Set calculatedStartDate to start of that day (00:00:00)
            calculatedStartDate.setHours(0, 0, 0, 0);
        } else if (dateRange === "custom") {
            if (startDate) {
                calculatedStartDate = new Date(startDate);
                calculatedStartDate.setHours(0, 0, 0, 0);
            }
            if (endDate) {
                calculatedEndDate = new Date(endDate);
            }
        }

        if (calculatedStartDate) {
            query.createdAt = query.createdAt || {};
            query.createdAt.$gte = calculatedStartDate;
        }
        if (calculatedEndDate) {
            query.createdAt = query.createdAt || {};
            const end = new Date(calculatedEndDate);
            end.setHours(23, 59, 59, 999);
            query.createdAt.$lte = end;
        }

        // Optional Filter: Amount
        if (minAmount && !isNaN(minAmount) && minAmount.trim() !== "") {
            query.amount = query.amount || {};
            query.amount.$gte = Number(minAmount);
        }
        if (maxAmount && !isNaN(maxAmount) && maxAmount.trim() !== "") {
            query.amount = query.amount || {};
            query.amount.$lte = Number(maxAmount);
        }

        // Optional Filter: Status
        if (status && status !== "all") {
            query.status = status;
        }

        // Optional Filter: Counterparty
        if (counterparty && counterparty.trim()) {
            const matchedUsers = await User.find({
                $or: [
                    { name: { $regex: new RegExp(escapeRegex(counterparty.trim()), "i") } },
                    { email: { $regex: new RegExp(escapeRegex(counterparty.trim()), "i") } }
                ]
            }).select("_id");
            const matchedUserIds = matchedUsers.map(u => u._id);
            if (matchedUserIds.length > 0) {
                query.$or = [
                    { sender: { $in: matchedUserIds } },
                    { receiver: { $in: matchedUserIds } }
                ];
            } else {
                // Return empty result
                query._id = null;
            }
        }

        // Fetch matching records
        const transactions = await WalletTransaction.find(query)
            .sort({ createdAt: -1 })
            .populate("sender", "name email")
            .populate("receiver", "name email");

        // 2. Calculate actual opening & closing balances over the calculated date range
        let balanceStart = 0;
        let balanceEnd = 0;

        // Sum all successful transactions prior to the calculatedStartDate
        const priorFilter = { user: userId, status: "success" };
        if (calculatedStartDate) {
            priorFilter.createdAt = { $lt: calculatedStartDate };
        }
        const priorStats = await WalletTransaction.aggregate([
            { $match: priorFilter },
            {
                $group: {
                    _id: null,
                    totalCredit: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] } },
                    totalDebit: { $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] } }
                }
            }
        ]);
        if (priorStats.length > 0) {
            balanceStart = priorStats[0].totalCredit - priorStats[0].totalDebit;
        }

        // Closing balance = sum up to calculatedEndDate
        const endFilter = { user: userId, status: "success" };
        if (calculatedEndDate) {
            const end = new Date(calculatedEndDate);
            end.setHours(23, 59, 59, 999);
            endFilter.createdAt = { $lte: end };
        }
        const endStats = await WalletTransaction.aggregate([
            { $match: endFilter },
            {
                $group: {
                    _id: null,
                    totalCredit: { $sum: { $cond: [{ $eq: ["$type", "credit"] }, "$amount", 0] } },
                    totalDebit: { $sum: { $cond: [{ $eq: ["$type", "debit"] }, "$amount", 0] } }
                }
            }
        ]);
        if (endStats.length > 0) {
            balanceEnd = endStats[0].totalCredit - endStats[0].totalDebit;
        } else {
            balanceEnd = 0;
        }

        // 3. Formatted Outputs
        if (format === "csv") {
            const header = "DATE,TYPE,AMOUNT,SOURCE,STATUS,DESCRIPTION,REFERENCE_ID,SENDER_EMAIL,RECEIVER_EMAIL\n";
            const records = transactions.map(t => {
                const date = t.createdAt.toISOString().split("T")[0];
                const type = t.type.toUpperCase();
                const amount = t.amount;
                const source = t.source.toUpperCase();
                const status = t.status.toUpperCase();
                const desc = `"${(t.description || "").replace(/"/g, '""')}"`;
                const refId = t.referenceId || "";
                const senderEmail = t.sender?.email || "";
                const receiverEmail = t.receiver?.email || "";
                return `${date},${type},${amount},${source},${status},${desc},${refId},${senderEmail},${receiverEmail}`;
            }).join("\n");

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', `attachment; filename="wallet_statement_${Date.now()}.csv"`);
            return res.send(header + records);
        } else if (format === "pdf") {
            const PDFDocument = require("pdfkit");
            const doc = new PDFDocument({ margin: 50 });

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="wallet_statement_${Date.now()}.pdf"`);
            doc.pipe(res);

            const user = await User.findById(userId);

            // Document Header
            doc.font("Helvetica-Bold").fillColor("#1e293b").fontSize(20).text("Expense Tracker Pro", { align: "center" });
            doc.fontSize(14).fillColor("#4f46e5").text("Smart Wallet Statement", { align: "center" });
            doc.moveDown(1.5);

            // User & Statement Details
            doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a").text("STATEMENT DETAILS");
            doc.font("Helvetica").fillColor("#475569");
            doc.text(`User Name: ${user.name}`);
            doc.text(`Email Address: ${user.email}`);

            const startStr = calculatedStartDate ? calculatedStartDate.toLocaleDateString("en-IN") : "Beginning of Time";
            const endStr = calculatedEndDate ? calculatedEndDate.toLocaleDateString("en-IN") : "Present";
            doc.text(`Statement Period: ${startStr} to ${endStr}`);

            // Active Filters list
            const activeFilters = [];
            if (type && type !== "all") activeFilters.push(`Type: ${type}`);
            if (minAmount) activeFilters.push(`Min Amount: ₹${minAmount}`);
            if (maxAmount) activeFilters.push(`Max Amount: ₹${maxAmount}`);
            if (counterparty) activeFilters.push(`Counterparty: ${counterparty}`);
            if (status && status !== "all") activeFilters.push(`Status: ${status}`);
            
            doc.text(`Applied Filters: ${activeFilters.length > 0 ? activeFilters.join(", ") : "None"}`);
            doc.moveDown(1);

            // Balances Section
            doc.font("Helvetica-Bold").fontSize(12).fillColor("#1e293b").text("ACCOUNT BALANCE SUMMARY");
            doc.moveTo(50, doc.y).lineTo(540, doc.y).strokeColor("#cbd5e1").stroke();
            doc.moveDown(0.5);
            doc.font("Helvetica").fillColor("#475569");
            doc.text(`Opening Balance: `, { continued: true }).font("Helvetica-Bold").fillColor("#0f172a").text(`₹${balanceStart.toFixed(2)}`);
            doc.font("Helvetica").fillColor("#475569").text(`Closing Balance: `, { continued: true }).font("Helvetica-Bold").fillColor("#0f172a").text(`₹${balanceEnd.toFixed(2)}`);
            doc.moveDown(1.5);

            // Table Headers
            doc.font("Helvetica-Bold").fontSize(10).fillColor("#1e293b").text("TRANSACTION DETAILS");
            doc.moveDown(0.5);
            
            const tableTop = doc.y;
            doc.fontSize(9).fillColor("#1e293b");
            doc.text("Date", 50, tableTop, { width: 70 });
            doc.text("Type", 120, tableTop, { width: 50 });
            doc.text("Amount", 170, tableTop, { width: 60, align: "right" });
            doc.text("Source", 240, tableTop, { width: 70 });
            doc.text("Status", 310, tableTop, { width: 50 });
            doc.text("Description", 370, tableTop, { width: 170 });

            doc.moveTo(50, tableTop + 15).lineTo(540, tableTop + 15).strokeColor("#64748b").stroke();

            doc.font("Helvetica");
            let y = tableTop + 25;

            transactions.forEach(t => {
                if (y > 700) {
                    doc.addPage();
                    y = 50;
                    
                    // Redraw Table Headers on new page
                    doc.font("Helvetica-Bold").fontSize(9).fillColor("#1e293b");
                    doc.text("Date", 50, y, { width: 70 });
                    doc.text("Type", 120, y, { width: 50 });
                    doc.text("Amount", 170, y, { width: 60, align: "right" });
                    doc.text("Source", 240, y, { width: 70 });
                    doc.text("Status", 310, y, { width: 50 });
                    doc.text("Description", 370, y, { width: 170 });
                    doc.moveTo(50, y + 15).lineTo(540, y + 15).strokeColor("#64748b").stroke();
                    doc.font("Helvetica");
                    
                    y += 25;
                }

                const formattedDate = t.createdAt.toLocaleDateString("en-IN");
                const formattedType = t.type.toUpperCase();
                const formattedAmount = `₹${t.amount.toFixed(2)}`;
                const formattedSource = t.source.toUpperCase();
                const formattedStatus = t.status.toUpperCase();
                const descriptionText = t.description || "";

                doc.fillColor(t.type === "credit" ? "#16a34a" : "#dc2626");
                doc.text(formattedDate, 50, y, { width: 70 });
                doc.text(formattedType, 120, y, { width: 50 });
                doc.text(formattedAmount, 170, y, { width: 60, align: "right" });
                
                doc.fillColor("#334155");
                doc.text(formattedSource, 240, y, { width: 70 });
                doc.text(formattedStatus, 310, y, { width: 50 });
                doc.text(descriptionText, 370, y, { width: 170 });

                y += 20;
            });

            doc.end();
            return;
        }

        res.status(400).json({ success: false, message: "Unsupported format. Use csv or pdf." });
    } catch (error) {
        console.error("Export statement error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};
