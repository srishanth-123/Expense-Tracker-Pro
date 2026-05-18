const express = require("express");
const router = express.Router();
const { createOrder, verifyPayment } = require("../controllers/paymentController");
const authMiddleware = require("../middleware/authMiddleware");
const { paymentLimiter } = require("../middleware/rateLimitMiddleware");

router.post("/create-order", authMiddleware, paymentLimiter, createOrder);
router.post("/verify", authMiddleware, paymentLimiter, verifyPayment);

module.exports = router;
