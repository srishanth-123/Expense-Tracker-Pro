const User = require("../models/user");
const WalletTransaction = require("../models/WalletTransaction");
const Split = require("../models/split");
const Transaction = require("../models/Transaction");
const Category = require("../models/category");
const { withRetry } = require("../utils/retry");

class SagaService {
    async runSaga(steps) {
        const completedNodes = [];
        try {
            for (const step of steps) {
                console.log(`[SAGA EXECUTOR] Committing: ${step.name}`);
                // Safely execute step with strict exponential retry boundaries
                const payload = await withRetry(() => step.execute());
                completedNodes.push({ ...step, payload }); // bind payload dynamically for compensations
            }
            return true;
        } catch (error) {
            console.error(`[SAGA CRITICAL] Sequence fundamentally broke: ${error.message}. Executing backward compensators.`);
            await this.executeRollback(completedNodes);
            throw new Error(`Sequence aborted: ${error.message}`);
        }
    }

    async executeRollback(completedNodes) {
        const rollbackChain = [...completedNodes].reverse();
        for (const step of rollbackChain) {
            try {
                if (step.compensate) {
                    console.log(`[SAGA COMPENSATOR] Reverting: ${step.name}`);
                    await withRetry(() => step.compensate(step.payload));
                }
            } catch (fatalError) {
                // If compensation fails absolutely after multi-retries, manual DB intervention flag required
                console.error(`[SAGA FATAL ALARM] Compensator absolutely failed for ${step.name}. State corrupted! ${fatalError.message}`);
            }
        }
        console.log(`[SAGA ROLLBACK] System stabilized to origin snapshot.`);
    }

    async runSplitSettlementSaga(payerId, receiverId, splitId, shareAmount, participantIndex) {
        const settlementAmount = Math.round(Number(shareAmount) * 100) / 100;
        const steps = [
            {
                name: "T1_DEDUCT_WALLET",
                execute: async () => {
                    const payer = await User.findOneAndUpdate(
                        { _id: payerId, walletBalance: { $gte: settlementAmount } },
                        { $inc: { walletBalance: -settlementAmount } },
                        { new: true }
                    );
                    if (!payer) throw new Error("Insufficient wallet balance");
                    return { id: payerId, amount: settlementAmount };
                },
                compensate: async (data) => {
                    await User.findByIdAndUpdate(data.id, { $inc: { walletBalance: data.amount } });
                }
            },
            {
                name: "T2_CREDIT_RECEIVER",
                execute: async () => {
                    const receiver = await User.findByIdAndUpdate(receiverId, { $inc: { walletBalance: settlementAmount } }, { new: true });
                    if (!receiver) throw new Error("Receiver not found");
                    return { id: receiverId, amount: settlementAmount };
                },
                compensate: async (data) => {
                    await User.findByIdAndUpdate(data.id, { $inc: { walletBalance: -data.amount } });
                }
            },
            {
                name: "T3_CREATE_PAYER_LOG",
                execute: async () => {
                    const split = await Split.findById(splitId).select("description");
                    const log = await WalletTransaction.create({
                        user: payerId,
                        type: "debit",
                        amount: settlementAmount,
                        source: "split",
                        status: "success",
                        referenceId: `SPLIT-${splitId}`,
                        description: `Settled split: ${split?.description || splitId}`
                    });
                    return { logId: log._id };
                },
                compensate: async (data) => {
                    await WalletTransaction.findByIdAndDelete(data.logId);
                }
            },
            {
                name: "T4_CREATE_RECEIVER_LOG",
                execute: async () => {
                    const split = await Split.findById(splitId).select("description");
                    const log = await WalletTransaction.create({
                        user: receiverId,
                        type: "credit",
                        amount: settlementAmount,
                        source: "split",
                        status: "success",
                        referenceId: `RECV-SPLIT-${splitId}`,
                        description: `Received split settlement: ${split?.description || splitId}`
                    });
                    return { logId: log._id };
                },
                compensate: async (data) => {
                    await WalletTransaction.findByIdAndDelete(data.logId);
                }
            },
            {
                name: "T5_SEND_NOTIFICATION",
                execute: async () => {
                    const Notification = require("../models/notificationModel");
                    const { sendNotificationToUser } = require("../utils/socket");
                    const payer = await User.findById(payerId).select("name");
                    const split = await Split.findById(splitId).select("description");
                    const payerName = payer ? payer.name : "A user";
                    const splitDescription = split ? split.description : "Split expense";

                    const notification = await Notification.create({
                        user: receiverId,
                        type: "SPLIT_SETTLEMENT_RECEIVED",
                        message: `You received ₹${settlementAmount} from ${payerName} for split: ${splitDescription}`
                    });
                    sendNotificationToUser(receiverId, notification);
                    return { notificationId: notification._id };
                },
                compensate: async (data) => {
                    const Notification = require("../models/notificationModel");
                    if (data && data.notificationId) {
                        await Notification.findByIdAndDelete(data.notificationId);
                    }
                }
            },
            {
                name: "T6_LOCK_SPLIT_PAID",
                execute: async () => {
                    const split = await Split.findById(splitId);
                    if (!split) throw new Error("Split not found");
                    if (split.participants[participantIndex].paid) throw new Error("Split already settled");
                    split.participants[participantIndex].paid = true;
                    split.participants[participantIndex].status = "paid";
                    split.status = split.participants.every(p => p.paid || p.status === "unregistered") ? "settled" : "pending";
                    await split.save();
                    return { sId: splitId, pIdx: participantIndex, previousStatus: split.status };
                },
                compensate: async (data) => {
                    const split = await Split.findById(data.sId);
                    split.participants[data.pIdx].paid = false;
                    split.participants[data.pIdx].status = "pending";
                    split.status = "pending";
                    await split.save();
                }
            },
            {
                name: "T7_CREATE_TRANSACTION",
                execute: async () => {
                    const split = await Split.findById(splitId);
                    // Find or create a "Split Settlement" category
                    let category = await Category.findOne({ user: payerId, name: "Split Settlement", isDeleted: false });
                    if (!category) {
                        category = await Category.create({ user: payerId, name: "Split Settlement" });
                    }
                    const transaction = await Transaction.create({
                        user: payerId,
                        type: "expense",
                        amount: settlementAmount,
                        description: `Split settlement: ${split.description}`,
                        date: new Date(),
                        isDeleted: false,
                        category: category._id
                    });
                    return { txId: transaction._id };
                },
                compensate: async (data) => {
                    await Transaction.findByIdAndDelete(data.txId);
                }
            }
        ];
        const result = await this.runSaga(steps);
        if (result) {
            try {
                const Notification = require("../models/notificationModel");
                const { sendNotificationToUser } = require("../utils/socket");
                const payer = await User.findById(payerId);
                const receiverNotification = await Notification.create({
                    user: receiverId,
                    type: "SPLIT_SETTLED",
                    message: `${payer.name || 'A friend'} has settled their split of ₹${settlementAmount}.`
                });
                sendNotificationToUser(receiverId, receiverNotification);

                const payerNotification = await Notification.create({
                    user: payerId,
                    type: "SPLIT_SETTLED",
                    message: `You settled a split of ₹${settlementAmount} from your wallet.`
                });
                sendNotificationToUser(payerId, payerNotification);
            } catch (err) {
                console.error("Failed to send split settled notification", err);
            }
        }
        return result;
    }

    async runWalletTopupSaga(userId, amount, orderId, paymentId) {
        const Payment = require("../models/Payment");
        const steps = [
            {
                name: "T1_UPDATE_PAYMENT_STATUS",
                execute: async () => {
                    const payment = await Payment.findOneAndUpdate(
                        { orderId },
                        { status: "success", paymentId },
                        { new: true }
                    );
                    if (!payment) throw new Error("Payment record not found for Order ID");
                    return { orderId };
                },
                compensate: async (data) => {
                    await Payment.findOneAndUpdate(
                        { orderId: data.orderId },
                        { status: "failed" }
                    );
                }
            },
            {
                name: "T2_CREDIT_WALLET",
                execute: async () => {
                    await User.findByIdAndUpdate(userId, { $inc: { walletBalance: amount } });
                    return { id: userId, amount };
                },
                compensate: async (data) => {
                    await User.findByIdAndUpdate(data.id, { $inc: { walletBalance: -data.amount } });
                }
            },
            {
                name: "T3_CREATE_TOPUP_LOG",
                execute: async () => {
                    const log = await WalletTransaction.create({
                        user: userId,
                        type: "credit",
                        amount: amount,
                        source: "topup",
                        status: "success",
                        referenceId: `TOPUP-${paymentId}`
                    });
                    return { logId: log._id };
                },
                compensate: async (data) => {
                    await WalletTransaction.findByIdAndDelete(data.logId);
                }
            }
        ];
        return await this.runSaga(steps);
    }

    async runProSubscriptionUpgradeSaga(userId, price = 499) {
        const steps = [
            {
                name: "T1_DEDUCT_WALLET",
                execute: async () => {
                    const user = await User.findOneAndUpdate(
                        { _id: userId, walletBalance: { $gte: price } },
                        { $inc: { walletBalance: -price } },
                        { new: true }
                    );
                    if (!user) throw new Error("Insufficient wallet balance");
                    return { userId, price };
                },
                compensate: async (data) => {
                    await User.findByIdAndUpdate(data.userId, { $inc: { walletBalance: data.price } });
                }
            },
            {
                name: "T2_UPDATE_USER_PRO_STATUS",
                execute: async () => {
                    const user = await User.findByIdAndUpdate(userId, { isPro: true }, { new: true });
                    if (!user) throw new Error("User not found");
                    return { userId };
                },
                compensate: async (data) => {
                    await User.findByIdAndUpdate(data.userId, { isPro: false });
                }
            },
            {
                name: "T3_CREATE_UPGRADE_LOG",
                execute: async () => {
                    const log = await WalletTransaction.create({
                        user: userId,
                        type: "debit",
                        amount: price,
                        source: "subscription",
                        status: "success",
                        referenceId: `SUB-PRO-${Date.now()}`,
                        description: "Pro Subscription Upgrade"
                    });
                    return { logId: log._id };
                },
                compensate: async (data) => {
                    await WalletTransaction.findByIdAndDelete(data.logId);
                }
            }
        ];
        
        const result = await this.runSaga(steps);
        if (result) {
            try {
                const Notification = require("../models/notificationModel");
                const { sendNotificationToUser } = require("../utils/socket");
                const notification = await Notification.create({
                    user: userId,
                    type: "PRO_UPGRADE",
                    message: `Congratulations! You are now a Pro Member.`
                });
                sendNotificationToUser(userId, notification);
            } catch (err) {
                console.error("Failed to send pro upgrade notification", err);
            }
        }
        return result;
    }

    async runWalletWithdrawalSaga(userId, amount, upiId) {
        const steps = [
            {
                name: "T1_DEDUCT_WALLET",
                execute: async () => {
                    const user = await User.findOneAndUpdate(
                        { _id: userId, walletBalance: { $gte: amount } },
                        { $inc: { walletBalance: -amount } },
                        { new: true }
                    );
                    if (!user) throw new Error("Insufficient wallet balance");
                    return { userId, amount };
                },
                compensate: async (data) => {
                    await User.findByIdAndUpdate(data.userId, { $inc: { walletBalance: data.amount } });
                }
            },
            {
                name: "T2_SIMULATE_PAYOUT_TRANSFER",
                execute: async () => {
                    // Fail withdrawal if it exceeds ₹10,000 to show the Saga rollback in action
                    if (amount > 10000) {
                        throw new Error("Payout transaction rejected by bank (amount exceeds daily limit of ₹10,000 for standard accounts)");
                    }
                    await new Promise(resolve => setTimeout(resolve, 300));
                    return { upiId, amount };
                },
                compensate: async () => {
                    // Payout failed/was aborted, no compensation needed.
                }
            },
            {
                name: "T3_CREATE_WITHDRAWAL_LOG",
                execute: async () => {
                    const log = await WalletTransaction.create({
                        user: userId,
                        type: "debit",
                        amount: amount,
                        source: "upi",
                        status: "success",
                        referenceId: `WD-${Date.now()}`,
                        description: `Withdrawal to UPI: ${upiId}`
                    });
                    return { logId: log._id };
                },
                compensate: async (data) => {
                    await WalletTransaction.findByIdAndDelete(data.logId);
                }
            }
        ];

        const result = await this.runSaga(steps);
        if (result) {
            try {
                const Notification = require("../models/notificationModel");
                const { sendNotificationToUser } = require("../utils/socket");
                const notification = await Notification.create({
                    user: userId,
                    type: "WALLET_WITHDRAWAL",
                    message: `Successfully withdrew ₹${amount} from your wallet.`
                });
                sendNotificationToUser(userId, notification);
            } catch (err) {
                console.error("Failed to send wallet withdrawal notification", err);
            }
        }
        return result;
    }
}

module.exports = new SagaService();
