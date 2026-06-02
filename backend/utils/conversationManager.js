/**
 * Conversation Manager
 * ────────────────────
 * Redis-backed stateful conversation manager for multi-turn follow-up flows.
 * Stores pending action state (collected fields, missing fields, confirmation status)
 * with a configurable TTL to prevent stale state buildup.
 *
 * Falls back gracefully when Redis is unavailable — returns null state,
 * which causes the chat controller to treat every message as a fresh intent.
 */

const redis = require("../config/redis");
const logger = require("./logger");

const STATE_TTL = 600; // 10 minutes
const KEY_PREFIX = "chat:state:";

/**
 * Get the current conversation state for a user.
 * @param {string} userId
 * @returns {Object|null} The pending state, or null if none exists
 */
async function getState(userId) {
    if (!redis) return null;

    try {
        const key = `${KEY_PREFIX}${userId}`;
        const raw = await redis.get(key);
        if (!raw) return null;

        if (typeof raw === "object") return raw;
        if (typeof raw === "string") return JSON.parse(raw);

        logger.warn(`[ConversationManager] Unexpected state type: ${typeof raw}`);
        await redis.del(key);
        return null;
    } catch (err) {
        logger.error(`[ConversationManager] getState error: ${err.message}`);
        return null;
    }
}

/**
 * Save conversation state for a user.
 * @param {string} userId
 * @param {Object} state - The state to persist
 */
async function setState(userId, state) {
    if (!redis) return;

    try {
        const key = `${KEY_PREFIX}${userId}`;
        const stateWithTimestamp = {
            ...state,
            updatedAt: new Date().toISOString()
        };
        await redis.set(key, JSON.stringify(stateWithTimestamp), { ex: STATE_TTL });
    } catch (err) {
        logger.error(`[ConversationManager] setState error: ${err.message}`);
    }
}

/**
 * Clear conversation state for a user (after execution or cancellation).
 * @param {string} userId
 */
async function clearState(userId) {
    if (!redis) return;

    try {
        const key = `${KEY_PREFIX}${userId}`;
        await redis.del(key);
    } catch (err) {
        logger.error(`[ConversationManager] clearState error: ${err.message}`);
    }
}

/**
 * Merge newly collected fields into the existing state.
 * Recalculates missingFields based on the intent's requirements.
 *
 * @param {Object} existingState - Current state from Redis
 * @param {Object} newEntities   - Newly extracted entities from the follow-up message
 * @returns {Object} Updated state
 */
function mergeFields(existingState, newEntities) {
    const merged = {
        ...existingState,
        collectedFields: {
            ...existingState.collectedFields,
            ...filterNull(newEntities)
        }
    };

    // Recalculate missing fields based on intent requirements
    const required = getRequiredFields(merged.intent);
    const collected = merged.collectedFields;
    merged.missingFields = required.filter(f => !collected[f]);

    return merged;
}

/**
 * Return the list of required fields for a given intent.
 */
function getRequiredFields(intent) {
    switch (intent) {
        case "CREATE_TRANSACTION":
            return ["amount", "type", "categoryName"];
        case "CREATE_BUDGET":
            return ["categoryName", "budgetLimit"];
        case "CREATE_CATEGORY":
            return ["categoryNewName"];
        default:
            return [];
    }
}

/**
 * Generate a natural follow-up question for the next missing field.
 */
function generateFollowUpQuestion(missingFields, intent) {
    if (!missingFields || missingFields.length === 0) return null;

    const field = missingFields[0]; // Ask about one field at a time

    const questions = {
        amount: "How much was the amount?",
        type: "Is this an income or an expense?",
        categoryName: "Which category should I file this under?",
        description: "Any description for this transaction?",
        budgetLimit: "What should be the budget limit amount?",
        month: "Which month is this budget for?",
        year: "Which year?",
        categoryNewName: "What would you like to name the category?",
        newAmount: "What is the new amount you'd like to set?",
        newLimit: "What is the new budget limit you'd like to set?",
        newDescription: "What is the new description?",
        newCategoryName: "What is the new category name?"
    };

    return questions[field] || `Could you provide the ${field}?`;
}

/**
 * Filter out null/undefined values from an object.
 */
function filterNull(obj) {
    if (!obj) return {};
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value !== null && value !== undefined) {
            result[key] = value;
        }
    }
    return result;
}

module.exports = {
    getState,
    setState,
    clearState,
    mergeFields,
    getRequiredFields,
    generateFollowUpQuestion
};
