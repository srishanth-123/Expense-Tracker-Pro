const { callLLM } = require("../llmProvider");
const { parseIntent } = require("../../utils/intentParser");
const logger = require("../../utils/logger");

/**
 * Parses user intent using the existing intent parser.
 * Supports CREATE, UPDATE, DELETE, ANALYTICS_QUERY, CONFIRM, CANCEL, etc.
 */
async function detectIntent(message, userId, pendingState = null) {
    return await parseIntent(message, userId, pendingState);
}

/**
 * Summarizes older messages in a chat history to compact the context.
 * 
 * @param {Array} messages - List of ChatMessage documents { role, content }
 * @returns {Promise<string>} Concise summary text
 */
async function generateSummary(messages) {
    if (!messages || messages.length === 0) return "";
    
    const formattedHistory = messages
        .map(m => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");

    const systemPrompt = `You are a helpful personal finance chatbot assistant.
Summarize the following chat history between a User and the Assistant in under 3 concise sentences.
Highlight any pending actions, transactions created/edited/deleted, budgets discussed, or questions asked.
Keep it strictly technical and factual. Do not say "Here is a summary".`;

    try {
        const summary = await callLLM(systemPrompt, formattedHistory, false);
        return summary ? summary.trim() : "";
    } catch (err) {
        logger.error(`[geminiService] generateSummary error: ${err.message}`);
        return "";
    }
}

module.exports = {
    detectIntent,
    generateSummary
};
