const express = require("express");
const router = express.Router();
const { createOrder, verifyPayment, subscribePro, failPayment } = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const { paymentLimiter } = require("../middleware/rateLimitMiddleware");

router.post("/create-order", authMiddleware, paymentLimiter, createOrder);
router.post("/verify", authMiddleware, paymentLimiter, verifyPayment);
router.post("/subscribe-pro", authMiddleware, subscribePro);
router.post("/fail", authMiddleware, paymentLimiter, failPayment);

module.exports = router;

