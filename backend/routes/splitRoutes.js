const express = require("express");
const router = express.Router();
const { createSplit, getUserSplits, settleSplit } = require("../controllers/splitController");
const authMiddleware = require("../middleware/authMiddleware");
const { walletLimiter } = require("../middleware/rateLimitMiddleware");

// Secure all inner routes
router.use(authMiddleware);

router.post("/create", createSplit);
router.get("/user", getUserSplits);
router.post("/settle", walletLimiter, settleSplit);

module.exports = router;
