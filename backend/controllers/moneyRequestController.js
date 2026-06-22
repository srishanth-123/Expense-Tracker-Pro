const MoneyRequest = require("../models/MoneyRequest");
const User = require("../models/user");
const sagaService = require("../services/saga.service");
const Notification = require("../models/notificationModel");
const { sendNotificationToUser } = require("../utils/socket");
const logger = require("../utils/logger");
const idempotencyHandler = require("../utils/idempotency");

exports.createRequest = async (req, res) => {
    try {
        const { payerId, amount, notes } = req.body;
        const requesterId = req.user._id;
        const requestAmount = Math.round(Number(amount) * 100) / 100;
        const idempotencyKey = req.headers["x-idempotency-key"] || req.body.idempotencyKey;

        if (!payerId || !amount || isNaN(amount) || requestAmount <= 0) {
            return res.status(400).json({ success: false, message: "Valid payer and amount are required." });
        }

        if (requestAmount > 100000) {
            return res.status(400).json({ success: false, message: "Maximum request amount is ₹1,00,000." });
        }

        if (requesterId.toString() === payerId.toString()) {
            return res.status(400).json({ success: false, message: "Cannot request money from yourself." });
        }

        const payer = await User.findById(payerId).select("name email");
        if (!payer) {
            return res.status(404).json({ success: false, message: "Payer not found." });
        }

        const executeLogic = async () => {
            const request = await MoneyRequest.create({
                requester: requesterId,
                payer: payerId,
                amount: requestAmount,
                notes
            });

            // Notify payer
            try {
                const requester = await User.findById(requesterId).select("name email");
                const requesterName = requester?.name || requester?.email || "A user";
                const notification = await Notification.create({
                    user: payerId,
                    type: "MONEY_REQUEST",
                    message: `${requesterName} has requested ₹${requestAmount} from you.`
                });
                sendNotificationToUser(payerId, notification);
            } catch (err) {
                console.error("Failed to notify payer of request", err);
            }

            return request;
        };

        const request = await idempotencyHandler.checkOrExecute(idempotencyKey, executeLogic);

        res.json({ success: true, message: "Money request sent successfully", data: request });
    } catch (error) {
        logger.error(`Create money request error: ${error.message}`);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.getRequests = async (req, res) => {
    try {
        const userId = req.user._id;
        const incoming = await MoneyRequest.find({ payer: userId, status: "PENDING" })
            .populate("requester", "name email profilePicture")
            .sort({ createdAt: -1 });
        
        const outgoing = await MoneyRequest.find({ requester: userId, status: "PENDING" })
            .populate("payer", "name email profilePicture")
            .sort({ createdAt: -1 });

        res.json({ success: true, data: { incoming, outgoing } });
    } catch (error) {
        logger.error(`Get money requests error: ${error.message}`);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

exports.acceptRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const payerId = req.user._id;
        const idempotencyKey = req.headers["x-idempotency-key"] || req.body.idempotencyKey || `accept:${id}`;

        const executeLogic = async () => {
            const request = await MoneyRequest.findOne({ _id: id, payer: payerId, status: "PENDING" });
            if (!request) {
                throw new Error("Request not found or already processed.");
            }

            // The saga's atomic findOneAndUpdate with $gte is the authoritative balance check.
            // Removing the pre-saga check to eliminate the race condition where two concurrent
            // accept calls could both pass validation then both attempt deduction.
            await sagaService.runP2PTransferSaga(
                payerId, 
                request.requester, 
                request.amount, 
                request.notes || "Money Request Fulfillment"
            );

            request.status = "ACCEPTED";
            await request.save();

            // Notify requester that their request was accepted and money received
            try {
                const payer = await User.findById(payerId).select("name email");
                const payerName = payer?.name || payer?.email || "A user";
                const notification = await Notification.create({
                    user: request.requester,
                    type: "MONEY_REQUEST_ACCEPTED",
                    message: `${payerName} accepted your request and sent you ₹${request.amount}.`
                });
                sendNotificationToUser(request.requester, notification);
            } catch (err) {
                console.error("Failed to notify requester of acceptance", err);
            }

            return { message: "Request accepted and money sent." };
        };

        const result = await idempotencyHandler.checkOrExecute(idempotencyKey, executeLogic);

        res.json({ success: true, message: result.message || "Request accepted and money sent." });
    } catch (error) {
        logger.error(`Accept money request error: ${error.message}`);
        res.status(500).json({ success: false, message: error.message || "Server error" });
    }
};

exports.rejectRequest = async (req, res) => {
    try {
        const { id } = req.params;
        const payerId = req.user._id;
        const idempotencyKey = req.headers["x-idempotency-key"] || req.body.idempotencyKey || `reject:${id}`;

        const executeLogic = async () => {
            const request = await MoneyRequest.findOne({ _id: id, payer: payerId, status: "PENDING" });
            if (!request) {
                throw new Error("Request not found or already processed.");
            }

            request.status = "REJECTED";
            await request.save();

            // Notify requester of rejection
            try {
                const payer = await User.findById(payerId).select("name email");
                const payerName = payer?.name || payer?.email || "A user";
                const notification = await Notification.create({
                    user: request.requester,
                    type: "MONEY_REQUEST_REJECTED",
                    message: `${payerName} has declined your request for ₹${request.amount}.`
                });
                sendNotificationToUser(request.requester, notification);
            } catch (err) {
                console.error("Failed to notify requester of rejection", err);
            }

            return { message: "Request rejected." };
        };

        const result = await idempotencyHandler.checkOrExecute(idempotencyKey, executeLogic);

        res.json({ success: true, message: result.message || "Request rejected." });
    } catch (error) {
        logger.error(`Reject money request error: ${error.message}`);
        res.status(500).json({ success: false, message: error.message || "Server error" });
    }
};
