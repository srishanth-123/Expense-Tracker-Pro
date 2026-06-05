const ChatSession = require("../../models/chat/ChatSession");
const ChatMessage = require("../../models/chat/ChatMessage");
const User = require("../../models/user");
const chatbotService = require("../../services/chatbot/chatbotService");
const logger = require("../../utils/logger");

/**
 * Send a message inside a specific chat session.
 */
exports.sendMessageToSession = async (req, res) => {
    try {
        const { message } = req.body;
        const { id: sessionId } = req.params;
        const userId = req.user._id;

        if (!message || !message.trim()) {
            return res.status(400).json({ success: false, message: "Message is required." });
        }

        const session = await ChatSession.findOne({ _id: sessionId, user: userId });
        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found." });
        }

        const user = await User.findById(userId).select("name walletBalance isPro");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // ── Freemium Quota Enforcement ──
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const messageCount = await ChatMessage.countDocuments({
            user: userId,
            role: "user",
            createdAt: { $gte: startOfMonth }
        });

        if (!user.isPro && messageCount >= 5) {
            return res.status(403).json({
                success: false,
                isLimitExceeded: true,
                message: "You have used your 5 free messages for this month. Upgrade to Pro for unlimited chat."
            });
        }

        // Run chat state machine logic
        const responsePayload = await chatbotService.handleSessionMessage(
            userId,
            sessionId,
            message.trim(),
            user
        );

        res.json({
            ...responsePayload,
            limit: 5,
            used: messageCount + 1,
            remaining: Math.max(0, 5 - (messageCount + 1))
        });
    } catch (err) {
        logger.error(`[chatMessageController] sendMessageToSession error: ${err.message}`);
        res.status(500).json({ success: false, message: "Server error processing message." });
    }
};

/**
 * List paginated chat messages for a specific session.
 */
exports.listSessionMessages = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id: sessionId } = req.params;

        const session = await ChatSession.findOne({ _id: sessionId, user: userId });
        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found." });
        }

        const page = Math.max(1, parseInt(req.query.page) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
        const skip = (page - 1) * limit;

        const messages = await ChatMessage.find({ session: sessionId })
            .sort({ createdAt: 1 })
            .skip(skip)
            .limit(limit)
            .lean();

        const total = await ChatMessage.countDocuments({ session: sessionId });

        res.json({
            success: true,
            message: "Messages retrieved successfully",
            data: messages,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (err) {
        logger.error(`[chatMessageController] listSessionMessages error: ${err.message}`);
        res.status(500).json({ success: false, message: "Server error retrieving messages." });
    }
};
