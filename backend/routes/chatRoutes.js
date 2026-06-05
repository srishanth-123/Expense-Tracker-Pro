const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");

// Stateful Chat Controllers
const chatSessionController = require("../controllers/chat/chatSessionController");
const chatMessageController = require("../controllers/chat/chatMessageController");

// Session-Aware Endpoints

// Upgraded Session-Aware Endpoints
router.get("/sessions", protect, chatSessionController.listSessions);
router.post("/sessions", protect, chatSessionController.createSession);
router.patch("/sessions/:id", protect, chatSessionController.renameSession);
router.delete("/sessions/:id", protect, chatSessionController.deleteSession);

router.get("/sessions/:id/messages", protect, chatMessageController.listSessionMessages);
router.post("/sessions/:id/messages", protect, chatMessageController.sendMessageToSession);

module.exports = router;
