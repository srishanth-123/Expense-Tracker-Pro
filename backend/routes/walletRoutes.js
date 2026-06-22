const express = require("express");
const router = express.Router();
const { getBalance, getHistory, withdrawFunds, searchUsers, transferP2P, getWalletAnalytics, exportStatement } = require("../controllers/walletController");
const authMiddleware = require("../middleware/authMiddleware");
const { walletLimiter } = require("../middleware/rateLimitMiddleware");

// Secure all inner routes
router.use(authMiddleware);

// NOTE: There is no "/add" endpoint — funds can only be added through the
// verified Razorpay flow (/payment/verify) to prevent arbitrary self-crediting.
router.post("/withdraw", walletLimiter, withdrawFunds);
router.post("/transfer", walletLimiter, transferP2P);
router.get("/users/search", searchUsers);
router.get("/balance", getBalance);
router.get("/history", getHistory);
router.get("/analytics", getWalletAnalytics);
router.get("/export", exportStatement);

module.exports = router;
