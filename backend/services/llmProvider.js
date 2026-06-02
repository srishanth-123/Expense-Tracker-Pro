/**
 * LLM Provider Abstraction
 * ------------------------
 * Provider-agnostic wrapper around an OpenAI / Anthropic / Gemini-compatible
 * chat completion API. The active provider is selected at runtime via the
 * `AI_PROVIDER` env var. Returns the assistant message text, or `null` when
 * the provider is not configured / fails — callers MUST handle null and use a
 * rule-based fallback so the feature never breaks user-facing flows.
 *
 * Supported providers:
 *   - "openai"     → uses OPENAI_API_KEY, model OPENAI_MODEL (default gpt-4o-mini)
 *   - "anthropic"  → uses ANTHROPIC_API_KEY, model ANTHROPIC_MODEL (default claude-3-5-haiku-latest)
 *   - "gemini"     → uses GEMINI_API_KEY, model GEMINI_MODEL (default gemini-2.5-flash)
 *
 * No new dependencies — uses native global `fetch` (Node 18+, which Express 5 requires).
 */

const logger = require("../utils/logger");

const PROVIDER = (process.env.AI_PROVIDER || "openai").toLowerCase();

const isConfigured = () => {
    if (PROVIDER === "openai")    return !!process.env.OPENAI_API_KEY;
    if (PROVIDER === "anthropic") return !!process.env.ANTHROPIC_API_KEY;
    if (PROVIDER === "gemini")    return !!process.env.GEMINI_API_KEY;
    return false;
};

async function callOpenAI(systemPrompt, userPrompt, isJson = true) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
            model: process.env.OPENAI_MODEL || "gpt-4o-mini",
            temperature: 0.4,
            response_format: isJson ? { type: "json_object" } : undefined,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
        }),
    });
    if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.choices?.[0]?.message?.content || null;
}

async function callAnthropic(systemPrompt, userPrompt) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-api-key": process.env.ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
            model: process.env.ANTHROPIC_MODEL || "claude-3-5-haiku-latest",
            max_tokens: 1024,
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
        }),
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
    const json = await res.json();
    return json.content?.[0]?.text || null;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function callGemini(systemPrompt, userPrompt, isJson = true) {
    const primaryModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
    const backupModel = primaryModel === "gemini-2.5-flash" ? "gemini-2.5-flash-lite" : null;

    async function attemptCall(modelName) {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${process.env.GEMINI_API_KEY}`;
        const maxRetries = 2;
        let lastError = null;

        for (let i = 0; i <= maxRetries; i++) {
            try {
                if (i > 0) {
                    const delay = i * 800; // 800ms, 1600ms
                    logger.warn(`[AI] Retrying Gemini call for ${modelName} (attempt ${i + 1}/${maxRetries + 1}) after ${delay}ms...`);
                    await wait(delay);
                }

                const res = await fetch(url, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        systemInstruction: { parts: [{ text: systemPrompt }] },
                        contents: [{ role: "user", parts: [{ text: userPrompt }] }],
                        generationConfig: { 
                            temperature: 0.4, 
                            responseMimeType: isJson ? "application/json" : undefined 
                        },
                    }),
                });

                if (!res.ok) {
                    const errText = await res.text();
                    lastError = new Error(`Gemini ${res.status}: ${errText}`);
                    
                    if (res.status !== 429 && res.status !== 503) {
                        throw lastError;
                    }
                    continue; // retry
                }

                const json = await res.json();
                const content = json.candidates?.[0]?.content?.parts?.[0]?.text;
                if (content) return content;
                throw new Error("Empty candidate list or invalid response format");
            } catch (err) {
                lastError = err;
                if (err.message && !err.message.includes("429") && !err.message.includes("503")) {
                    throw err;
                }
            }
        }
        throw lastError || new Error("Failed after retries");
    }

    try {
        return await attemptCall(primaryModel);
    } catch (err) {
        if (backupModel) {
            logger.warn(`[AI] Primary model ${primaryModel} failed. Falling back to backup model ${backupModel}... Error: ${err.message}`);
            try {
                return await attemptCall(backupModel);
            } catch (backupErr) {
                logger.error(`[AI] Backup model ${backupModel} also failed: ${backupErr.message}`);
                throw backupErr;
            }
        }
        throw err;
    }
}

/**
 * callLLM(systemPrompt, userPrompt, isJson) → string | null
 * Returns the raw assistant text. Never throws — logs and returns null on failure.
 */
async function callLLM(systemPrompt, userPrompt, isJson = true) {
    if (!isConfigured()) {
        logger.warn(`[AI] Provider "${PROVIDER}" not configured — skipping LLM call`);
        return null;
    }
    try {
        if (PROVIDER === "openai")    return await callOpenAI(systemPrompt, userPrompt, isJson);
        if (PROVIDER === "anthropic") return await callAnthropic(systemPrompt, userPrompt);
        if (PROVIDER === "gemini")    return await callGemini(systemPrompt, userPrompt, isJson);
        logger.warn(`[AI] Unknown provider "${PROVIDER}"`);
        return null;
    } catch (err) {
        logger.error(`[AI] LLM call failed (${PROVIDER}): ${err.message}`, err);
        return null;
    }
}

module.exports = { callLLM, isConfigured, PROVIDER };
