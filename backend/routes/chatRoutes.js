const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { sendMessage, getHistory, clearHistory } = require("../controllers/chatController");

router.get("/history", protect, getHistory);
router.post("/message", protect, sendMessage);
router.delete("/history", protect, clearHistory);

module.exports = router;
