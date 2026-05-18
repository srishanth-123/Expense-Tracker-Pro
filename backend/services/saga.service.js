const User = require("../models/user");
const WalletTransaction = require("../models/WalletTransaction");
const Split = require("../models/split");
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
        const steps = [
            {
                name: "T1_DEDUCT_WALLET",
                execute: async () => {
                    const payer = await User.findById(payerId);
                    if (payer.walletBalance < shareAmount) throw new Error("Hard wall: Insufficient Balance.");
                    payer.walletBalance -= shareAmount;
                    await payer.save();
                    return { id: payerId, amount: shareAmount };
                },
                compensate: async (data) => {
                    await User.findByIdAndUpdate(data.id, { $inc: { walletBalance: data.amount } });
                }
            },
            {
                name: "T2_CREDIT_RECEIVER",
                execute: async () => {
                    await User.findByIdAndUpdate(receiverId, { $inc: { walletBalance: shareAmount } });
                    return { id: receiverId, amount: shareAmount };
                },
                compensate: async (data) => {
                    await User.findByIdAndUpdate(data.id, { $inc: { walletBalance: -data.amount } });
                }
            },
            {
                name: "T3_CREATE_PAYER_LOG",
                execute: async () => {
                    const log = await WalletTransaction.create({
                        user: payerId, type: "debit", amount: shareAmount, source: "split", status: "success", referenceId: `SPLIT-${splitId}`
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
                    const log = await WalletTransaction.create({
                        user: receiverId, type: "credit", amount: shareAmount, source: "split", status: "success", referenceId: `RECV-SPLIT-${splitId}`
                    });
                    return { logId: log._id };
                },
                compensate: async (data) => {
                    await WalletTransaction.findByIdAndDelete(data.logId);
                }
            },
            {
                name: "T5_LOCK_SPLIT_PAID",
                execute: async () => {
                    const split = await Split.findById(splitId);
                    split.participants[participantIndex].paid = true;
                    await split.save();
                    return { sId: splitId, pIdx: participantIndex };
                },
                compensate: async (data) => {
                    const split = await Split.findById(data.sId);
                    split.participants[data.pIdx].paid = false;
                    await split.save();
                }
            }
        ];
        return await this.runSaga(steps);
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
}

module.exports = new SagaService();
