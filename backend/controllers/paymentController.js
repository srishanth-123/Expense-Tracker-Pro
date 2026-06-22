const Razorpay = require("razorpay");
const crypto = require("crypto");
const Payment = require("../models/Payment");
const User = require("../models/user");
const idempotencyHandler = require("../utils/idempotency");
const sagaService = require("../services/saga.service");
const { sendPaymentSuccessEmail } = require("../services/emailService");
const logger = require("../utils/logger");

// RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are validated as required at startup
// (see config/envValidation.js), so no insecure fallback defaults are used here.
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.createOrder = async (req, res) => {
    try {
        const { amount, purpose } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        const validPurpose = purpose === "subscription" ? "subscription" : "wallet_topup";

        const options = {
            amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
            currency: "INR",
            // Receipt max length is 40. Using last 6 chars of user ID + timestamp
            receipt: `rcpt_${req.user._id.toString().slice(-6)}_${Date.now()}`
        };

        const order = await razorpay.orders.create(options);

        await Payment.create({
            user: req.user._id,
            amount: amount,
            orderId: order.id,
            status: "pending",
            purpose: validPurpose
        });

        res.status(201).json({
            success: true,
            message: "Order created successfully",
            data: {
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID
            }
        });
    } catch (error) {
        console.error("Create Razorpay order error:", error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.verifyPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

        if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        const secret = process.env.RAZORPAY_KEY_SECRET;
        
        // Generate cryptographic signature to verify authenticity
        const body = razorpay_order_id + "|" + razorpay_payment_id;
        const expectedSignature = crypto
            .createHmac("sha256", secret)
            .update(body.toString())
            .digest("hex");

        if (expectedSignature !== razorpay_signature) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        // Signature is valid. Proceed to fulfill the payment safely.
        const paymentDoc = await Payment.findOne({ orderId: razorpay_order_id });
        
        if (!paymentDoc) {
            return res.status(404).json({success: false, message: "Resource not found"});
        }

        if (paymentDoc.status === "success") {
            return res.status(200).json({ success: true, message: "Payment already processed", data: { status: "success" } });
        }

        const amountInRupees = paymentDoc.amount;
        if (!amountInRupees || amountInRupees <= 0) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }
        
        // Use Redis Idempotency to prevent double-crediting if frontend sends this twice
        const idempotencyKey = `idemp:razorpay_verify:${razorpay_payment_id}`;
        
        try {
            await idempotencyHandler.checkOrExecute(idempotencyKey, async () => {
                if (paymentDoc.purpose === "subscription") {
                    await sagaService.runProSubscriptionUpgradeSaga(
                        paymentDoc.user,
                        amountInRupees,
                        'razorpay',
                        razorpay_payment_id
                    );
                } else {
                    await sagaService.runWalletTopupSaga(
                        paymentDoc.user,
                        amountInRupees,
                        razorpay_order_id,
                        razorpay_payment_id
                    );
                }

                const user = await User.findById(paymentDoc.user).select("name email walletBalance");
                if (user) {
                    sendPaymentSuccessEmail(user, {
                        amount: amountInRupees,
                        walletBalance: user.walletBalance,
                        transactionId: razorpay_payment_id,
                        referenceId: razorpay_order_id
                    });
                }
            });
        } catch (sagaError) {
            if (sagaError.message.includes("Duplicate request")) {
                logger.info(`[IDEMPOTENCY] Blocked duplicate verification for payment ${razorpay_payment_id}`);
            } else {
                logger.error("[VERIFY SAGA ERROR]", sagaError);
                throw sagaError;
            }
        }

        res.status(200).json({ success: true, message: "Payment verified successfully", data: { status: "success" } });
    } catch (error) {
        logger.error("Payment verification error:", error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.subscribePro = async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId).select("isPro walletBalance");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }

        if (user.isPro) {
            return res.status(400).json({ success: false, message: "User is already a Pro member" });
        }

        const price = 499; // Price in INR
        if (user.walletBalance < price) {
            return res.status(400).json({ 
                success: false, 
                message: `Insufficient wallet balance. You need ₹${price} to upgrade, but your current balance is ₹${user.walletBalance.toFixed(2)}.` 
            });
        }

        // Run the Saga
        await sagaService.runProSubscriptionUpgradeSaga(userId, price);

        res.json({
            success: true,
            message: "Successfully upgraded to Pro membership!",
            data: { isPro: true }
        });
    } catch (error) {
        console.error("Pro subscription upgrade error:", error);
        res.status(500).json({ success: false, message: error.message || "Server error during Pro upgrade" });
    }
};

const cleanReason = (reason) => {
    if (!reason) return "Payment failed";
    const lower = reason.toLowerCase();
    if (lower.includes("declined by the bank") || lower.includes("declined by bank")) {
        return "Declined by bank";
    }
    if (lower.includes("cancelled") || lower.includes("dismissed")) {
        return "Cancelled by user";
    }
    if (lower.includes("bad credentials") || lower.includes("authentication failed")) {
        return "Authentication failed";
    }
    if (lower.includes("network") || lower.includes("timeout")) {
        return "Network timeout";
    }
    if (lower.includes("insufficient funds") || lower.includes("insufficient balance")) {
        return "Insufficient funds";
    }
    if (lower.includes("expired")) {
        return "Payment link expired";
    }
    
    const firstSentence = reason.split(/[.,;!]/)[0].trim();
    if (firstSentence.length > 0 && firstSentence.length < 50) {
        return firstSentence;
    }
    return reason.length > 40 ? reason.substring(0, 37) + "..." : reason;
};

exports.failPayment = async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, reason } = req.body;

        if (!razorpay_order_id) {
            return res.status(400).json({ success: false, message: "Order ID is required" });
        }

        const paymentDoc = await Payment.findOne({ orderId: razorpay_order_id });

        if (!paymentDoc) {
            return res.status(404).json({ success: false, message: "Payment record not found" });
        }

        // Only update if it is not already resolved
        if (paymentDoc.status === "pending") {
            paymentDoc.status = "failed";
            if (razorpay_payment_id) {
                paymentDoc.paymentId = razorpay_payment_id;
            }
            await paymentDoc.save();
        }

        // Create failed WalletTransaction entry
        const WalletTransaction = require("../models/WalletTransaction");
        const refId = razorpay_payment_id || `FAIL-${razorpay_order_id}`;
        const existingTx = await WalletTransaction.findOne({ referenceId: refId });
        
        if (!existingTx) {
            const cleanedReason = cleanReason(reason);
            await WalletTransaction.create({
                user: paymentDoc.user,
                type: paymentDoc.purpose === "subscription" ? "debit" : "credit",
                amount: paymentDoc.amount,
                source: paymentDoc.purpose === "subscription" ? "subscription" : "topup",
                status: "failed",
                referenceId: refId,
                description: paymentDoc.purpose === "subscription" 
                    ? `Failed subscription upgrade: ${cleanedReason}`
                    : `Failed wallet top-up: ${cleanedReason}`
            });
            logger.info(`[PAYMENT_FAILED] Logged failed payment transaction for order ${razorpay_order_id}`);
        }

        res.status(200).json({ success: true, message: "Payment failure recorded" });
    } catch (error) {
        logger.error("Recording payment failure error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

