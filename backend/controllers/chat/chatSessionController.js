const ChatSession = require("../../models/chat/ChatSession");
const ChatMessage = require("../../models/chat/ChatMessage");
const ConversationSummary = require("../../models/chat/ConversationSummary");
const redisMemory = require("../../utils/conversation/redisMemory");
const logger = require("../../utils/logger");

/**
 * List all chat sessions for the authenticated user.
 */
exports.listSessions = async (req, res) => {
    try {
        const userId = req.user._id;
        const sessions = await ChatSession.find({ user: userId })
            .sort({ updatedAt: -1 })
            .lean();

        res.json({
            success: true,
            message: "Sessions retrieved successfully",
            data: sessions
        });
    } catch (err) {
        logger.error(`[chatSessionController] listSessions error: ${err.message}`);
        res.status(500).json({ success: false, message: "Server error retrieving sessions." });
    }
};

/**
 * Create a new chat session.
 */
exports.createSession = async (req, res) => {
    try {
        const userId = req.user._id;
        const { title } = req.body;

        const session = await ChatSession.create({
            user: userId,
            title: title || "New Conversation",
            isActive: true
        });

        res.status(201).json({
            success: true,
            message: "Session created successfully",
            data: session
        });
    } catch (err) {
        logger.error(`[chatSessionController] createSession error: ${err.message}`);
        res.status(500).json({ success: false, message: "Server error creating session." });
    }
};

/**
 * Rename a chat session.
 */
exports.renameSession = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;
        const { title } = req.body;

        if (!title || !title.trim()) {
            return res.status(400).json({ success: false, message: "Title is required." });
        }

        const session = await ChatSession.findOneAndUpdate(
            { _id: id, user: userId },
            { title: title.trim() },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found." });
        }

        res.json({
            success: true,
            message: "Session renamed successfully",
            data: session
        });
    } catch (err) {
        logger.error(`[chatSessionController] renameSession error: ${err.message}`);
        res.status(500).json({ success: false, message: "Server error renaming session." });
    }
};

/**
 * Delete a session and clean up MongoDB documents and Redis state.
 */
exports.deleteSession = async (req, res) => {
    try {
        const userId = req.user._id;
        const { id } = req.params;

        const session = await ChatSession.findOne({ _id: id, user: userId });
        if (!session) {
            return res.status(404).json({ success: false, message: "Session not found." });
        }

        // 1. Delete ChatSession document
        await ChatSession.deleteOne({ _id: id });

        // 2. Cascade delete all messages in this session
        await ChatMessage.deleteMany({ session: id });

        // 3. Delete AI conversation summaries
        await ConversationSummary.deleteMany({ session: id });

        // 4. Wipe active session state from Redis
        await redisMemory.clearState(userId, id);

        logger.info(`[chatSessionController] Deleted session ${id} and wiped memory dependencies.`);

        res.json({
            success: true,
            message: "Session and associated messages deleted successfully."
        });
    } catch (err) {
        logger.error(`[chatSessionController] deleteSession error: ${err.message}`);
        res.status(500).json({ success: false, message: "Server error deleting session." });
    }
};
