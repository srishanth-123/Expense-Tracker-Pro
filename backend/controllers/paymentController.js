const Razorpay = require("razorpay");
const crypto = require("crypto");
const Payment = require("../models/Payment");
const User = require("../models/user");
const idempotencyHandler = require("../utils/idempotency");
const sagaService = require("../services/saga.service");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");
const { sendPaymentSuccessEmail } = require("../services/emailService");

// Note: Ensure RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are in .env
const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID || "test_key",
    key_secret: process.env.RAZORPAY_KEY_SECRET || "test_secret"
});

exports.createOrder = async (req, res) => {
    try {
        const { amount } = req.body;

        if (!amount || isNaN(amount) || amount <= 0) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

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
            status: "pending"
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

        const secret = process.env.RAZORPAY_KEY_SECRET || "test_secret";
        
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
                await sagaService.runWalletTopupSaga(
                    paymentDoc.user,
                    amountInRupees,
                    razorpay_order_id,
                    razorpay_payment_id
                );

                const notification = await Notification.create({
                    user: paymentDoc.user,
                    type: "WALLET_TOPUP",
                    message: `Successfully topped up ₹${amountInRupees} to your wallet.`
                });
                sendNotificationToUser(paymentDoc.user, notification);

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
                console.log(`[IDEMPOTENCY] Blocked duplicate verification for payment ${razorpay_payment_id}`);
            } else {
                console.error("[VERIFY SAGA ERROR]", sagaError);
                throw sagaError;
            }
        }

        res.status(200).json({ success: true, message: "Payment verified successfully", data: { status: "success" } });
    } catch (error) {
        console.error("Payment verification error:", error);
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
