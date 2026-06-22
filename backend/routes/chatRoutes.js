const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const requirePro = require("../middleware/proMiddleware");

// Stateful Chat Controllers
const chatSessionController = require("../controllers/chat/chatSessionController");
const chatMessageController = require("../controllers/chat/chatMessageController");

// Session-Aware Endpoints

// Upgraded Session-Aware Endpoints
router.get("/sessions", protect, requirePro, chatSessionController.listSessions);
router.post("/sessions", protect, requirePro, chatSessionController.createSession);
router.patch("/sessions/:id", protect, requirePro, chatSessionController.renameSession);
router.delete("/sessions/:id", protect, requirePro, chatSessionController.deleteSession);

router.get("/sessions/:id/messages", protect, requirePro, chatMessageController.listSessionMessages);
router.post("/sessions/:id/messages", protect, requirePro, chatMessageController.sendMessageToSession);

module.exports = router;
