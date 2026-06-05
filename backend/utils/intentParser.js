/**
 * Intent Parser
 * ─────────────
 * Uses the LLM to classify user messages into structured intents with
 * entity extraction. Falls back to GENERAL_CHAT on any parsing failure.
 *
 * Supported intents:
 *   CREATE_TRANSACTION | CREATE_BUDGET | CREATE_CATEGORY |
 *   UPDATE_TRANSACTION | UPDATE_BUDGET | UPDATE_CATEGORY |
 *   DELETE_TRANSACTION | DELETE_BUDGET | DELETE_CATEGORY |
 *   ANALYTICS_QUERY    | GENERAL_CHAT  | CONFIRM | CANCEL
 */

const { callLLM } = require("../services/llmProvider");
const Category = require("../models/category");
const logger = require("./logger");

/**
 * Build the system prompt for intent classification.
 * Includes the user's existing categories so the LLM can map natural
 * language names ("food", "groceries") to actual category names.
 */
async function buildIntentSystemPrompt(userId, pendingState = null) {
    // Fetch the user's active categories for grounding
    const categories = await Category.find({ user: userId, isDeleted: false })
        .select("name _id")
        .lean();

    const categoryList = categories.length > 0
        ? categories.map(c => `- "${c.name}" (id: ${c._id})`).join("\n")
        : "No categories created yet.";

    const now = new Date();
    const currentDate = now.toISOString().split("T")[0];
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    let pendingStateContext = "";
    if (pendingState) {
        pendingStateContext = `\nACTIVE CONVERSATION STATE:
- Current Intent: "${pendingState.intent}"
- Collected Fields: ${JSON.stringify(pendingState.collectedFields || {})}
- Missing Fields: ${JSON.stringify(pendingState.missingFields || [])}
- Awaiting Confirmation: ${pendingState.awaitingConfirmation || false}
- Awaiting Resolution: ${pendingState.awaitingResolution || false}

INSTRUCTION FOR PENDING STATE:
The user is currently responding to a follow-up query regarding the missing fields of the pending action. 
Please classify the user's input to extract the missing values. 
If they provide the missing field value, populate the corresponding field inside 'entities'. 
Keep the active intent as "${pendingState.intent}" rather than changing it to general chat, unless they explicitly request to cancel or change the task.`;
    }

    return `You are an intent classifier for a personal finance expense tracker app.

Given the user's message, extract a structured JSON object with the following fields:

{
  "intent": "CREATE_TRANSACTION | CREATE_BUDGET | CREATE_CATEGORY | UPDATE_TRANSACTION | UPDATE_BUDGET | UPDATE_CATEGORY | DELETE_TRANSACTION | DELETE_BUDGET | DELETE_CATEGORY | ANALYTICS_QUERY | GENERAL_CHAT | CONFIRM | CANCEL",
  "confidence": 0.0 to 1.0,
  "entities": {
    "amount": number or null,
    "type": "income" or "expense" or null,
    "categoryName": string or null (CRITICAL: extract ONLY the clean category name itself, e.g., "Travel", "Food", "Groceries". NEVER extract sentences or phrases like "i need to create a budget on travel"),
    "description": string or null,
    "date": "YYYY-MM-DD" or null,
    "month": number or null,
    "year": number or null,
    "budgetLimit": number or null,
    "categoryNewName": string or null (CRITICAL: extract ONLY the clean new category name itself, e.g., "Entertainment", "Utilities"),
    "analyticsType": "total_spending" | "category_breakdown" | "top_expenses" | "spending_prediction" | "budget_status" | "monthly_report" | "smart_insights" | null,
    
    "newAmount": number or null,
    "newDescription": string or null,
    "newCategoryName": string or null (CRITICAL: extract ONLY the clean new category name itself, e.g., "Travel", "Groceries"),
    "newLimit": number or null,
    "newMonth": number or null,
    "newYear": number or null
  },
  "missingFields": ["field1", "field2"],
  "followUpQuestion": "string or null"
}

RULES:
1. Classification rules:
   - "delete", "remove", "erase", "void", "cancel transaction" -> DELETE_TRANSACTION / DELETE_BUDGET / DELETE_CATEGORY
   - "edit", "change", "update", "rename", "modify", "adjust", "correct" -> UPDATE_TRANSACTION / UPDATE_BUDGET / UPDATE_CATEGORY
   - "add", "create", "track", "insert", "record", "spent", "received" -> CREATE_TRANSACTION / CREATE_BUDGET / CREATE_CATEGORY
2. For DELETE_TRANSACTION / DELETE_BUDGET / DELETE_CATEGORY:
   - Identify the item the user wants to delete. Extract details like amount, categoryName, description, date, month, or year into the regular query fields (amount, categoryName, etc.).
3. For UPDATE_TRANSACTION:
   - Identify the old transaction details (e.g. amount, categoryName, description, date) and put them in regular query fields.
   - Extract the new details to update (e.g. "change amount to 500", "update description to grocery") and place them in the new* parameters (newAmount, newDescription, newCategoryName, newDate).
4. For UPDATE_BUDGET:
   - Identify the target categoryName, month, and year in regular query fields.
   - Place the new limit in newLimit, new month in newMonth, new year in newYear.
5. For UPDATE_CATEGORY:
   - Map current category name to categoryName.
   - Place new name in categoryNewName or newCategoryName.
6. For CREATE_TRANSACTION: required fields are amount, type (income/expense), categoryName. Default date to today (${currentDate}) if not specified.
7. For CREATE_BUDGET: required fields are categoryName, budgetLimit, month, year. Default month/year to ${currentMonth}/${currentYear}.
8. For CREATE_CATEGORY: required field is categoryNewName.
9. For ANALYTICS_QUERY, set analyticsType to the closest match.
10. If the user says "yes", "confirm", "go ahead", "sure", "do it", "proceed" -> intent is CONFIRM.
11. If the user says "no", "cancel", "never mind", "stop", "don't" -> intent is CANCEL.
12. Map category names to the closest existing category when possible. Use exact name from the list.
13. If you cannot determine the intent with reasonable confidence, use GENERAL_CHAT.
14. For missingFields, list ONLY the required fields that are still unknown.
15. Provide a natural, friendly followUpQuestion if there are missing fields.
16. For categoryName, categoryNewName, and newCategoryName, extract ONLY the single-word or short phrase representing the category itself (e.g. "Travel", "Groceries", "Food"). NEVER extract the entire sentence, description, or verb phrases (e.g. do NOT extract "create a budget on travel", "spent on food", or "i need to create a budget on travel").

User's existing categories:
${categoryList}

Current date: ${currentDate}
Current month/year: ${currentMonth}/${currentYear}
${pendingStateContext || ""}

Return ONLY valid JSON. No markdown, no explanation.`;
}

/**
 * Parse user intent from a natural language message.
 *
 * @param {string} message - The raw user message
 * @param {string} userId - The user's ObjectId
 * @returns {Object} Parsed intent object, always returns a valid shape
 */
async function parseIntent(message, userId, pendingState = null) {
    const fallback = {
        intent: "GENERAL_CHAT",
        confidence: 1.0,
        entities: {},
        missingFields: [],
        followUpQuestion: null
    };

    try {
        // Quick keyword-based shortcuts for confirm/cancel (avoids LLM call)
        const lower = message.trim().toLowerCase();
        const confirmPatterns = /^(yes|yeah|yep|sure|confirm|go ahead|do it|proceed|ok|okay|y)\.?$/i;
        const cancelPatterns = /^(no|nah|nope|cancel|never mind|nevermind|stop|don't|dont|n)\.?$/i;

        if (confirmPatterns.test(lower)) {
            return { ...fallback, intent: "CONFIRM", confidence: 1.0 };
        }
        if (cancelPatterns.test(lower)) {
            return { ...fallback, intent: "CANCEL", confidence: 1.0 };
        }

        const systemPrompt = await buildIntentSystemPrompt(userId, pendingState);
        const rawResponse = await callLLM(systemPrompt, message, true);

        if (!rawResponse) {
            logger.warn("[IntentParser] LLM returned null — falling back to GENERAL_CHAT");
            return fallback;
        }

        // Parse the JSON response
        let parsed;
        try {
            parsed = JSON.parse(rawResponse);
        } catch {
            const jsonMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (jsonMatch) {
                parsed = JSON.parse(jsonMatch[1].trim());
            } else {
                logger.warn("[IntentParser] Failed to parse LLM JSON response");
                return fallback;
            }
        }

        const validIntents = [
            "CREATE_TRANSACTION", "CREATE_BUDGET", "CREATE_CATEGORY",
            "UPDATE_TRANSACTION", "UPDATE_BUDGET", "UPDATE_CATEGORY",
            "DELETE_TRANSACTION", "DELETE_BUDGET", "DELETE_CATEGORY",
            "ANALYTICS_QUERY", "GENERAL_CHAT", "CONFIRM", "CANCEL"
        ];

        if (!parsed.intent || !validIntents.includes(parsed.intent)) {
            logger.warn(`[IntentParser] Invalid intent: ${parsed.intent}`);
            return fallback;
        }

        if (parsed.confidence !== undefined && parsed.confidence < 0.6) {
            logger.info(`[IntentParser] Low confidence (${parsed.confidence}) — falling back to GENERAL_CHAT`);
            return { ...fallback, intent: "GENERAL_CHAT" };
        }

        const entities = parsed.entities || {};
        if (entities.categoryName) {
            entities.categoryName = cleanCategoryName(entities.categoryName);
        }
        if (entities.categoryNewName) {
            entities.categoryNewName = cleanCategoryName(entities.categoryNewName);
        }
        if (entities.newCategoryName) {
            entities.newCategoryName = cleanCategoryName(entities.newCategoryName);
        }

        return {
            intent: parsed.intent,
            confidence: parsed.confidence || 0.8,
            entities,
            missingFields: parsed.missingFields || [],
            followUpQuestion: parsed.followUpQuestion || null
        };
    } catch (err) {
        logger.error(`[IntentParser] Error: ${err.message}`, err);
        return fallback;
    }
}

function cleanCategoryName(name) {
    if (!name) return name;
    let clean = name.trim();
    
    const patternsToStrip = [
        /^(i\s+)?need\s+to\s+(create|add|make|update|delete)\s+a\s+budget\s+on\s+/i,
        /^(i\s+)?need\s+to\s+(create|add|make|update|delete)\s+a\s+category\s+(called|named|on|for)\s+/i,
        /^(i\s+)?need\s+to\s+(create|add|make|update|delete)\s+/i,
        /^create\s+a\s+budget\s+(on|for|of)\s+/i,
        /^create\s+budget\s+(on|for|of)\s+/i,
        /^budget\s+(on|for|of)\s+/i,
        /^spent\s+on\s+/i,
        /^spend\s+on\s+/i,
        /^expense\s+(on|for)\s+/i,
        /^add\s+a\s+(new\s+)?category\s+(called|named|for|on)\s+/i,
        /^add\s+a\s+budget\s+(for|on)\s+/i,
        /^add\s+/i,
        /^new\s+/i,
        /^category\s+called\s+/i,
        /^category\s+named\s+/i,
        /^(for|on|about|to|of)\s+/i
    ];

    let changed;
    do {
        changed = false;
        for (const pattern of patternsToStrip) {
            if (pattern.test(clean)) {
                clean = clean.replace(pattern, "");
                clean = clean.trim();
                changed = true;
            }
        }
    } while (changed);

    if (clean.length > 0) {
        clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    }
    
    return clean.trim();
}

module.exports = { parseIntent, cleanCategoryName };
