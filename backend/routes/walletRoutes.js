const express = require("express");
const router = express.Router();
const { addBalance, getBalance, getHistory, withdrawFunds } = require("../controllers/walletController");
const authMiddleware = require("../middleware/authMiddleware");
const { walletLimiter } = require("../middleware/rateLimitMiddleware");

// Secure all inner routes
router.use(authMiddleware);

router.post("/add", walletLimiter, addBalance);
router.post("/withdraw", walletLimiter, withdrawFunds);
router.get("/balance", getBalance);
router.get("/history", getHistory);

module.exports = router;
