/**
 * AI Financial Insights Service
 * -----------------------------
 * Builds a compact "financial snapshot" from existing analytics aggregations,
 * sends it to an LLM for natural-language insight generation, and falls back
 * to a deterministic rule-based generator if the LLM is unavailable or
 * returns malformed output.
 *
 * Output shape:
 *   {
 *     insights: [{ id, title, message, severity, icon }],
 *     summary: string,
 *     snapshot: { ... },   // raw metrics, useful for the UI
 *     source: "llm" | "rules",
 *     generatedAt: ISOString
 *   }
 *
 * NEVER throws — always returns a usable payload.
 */

const Transaction = require("../models/Transaction");
const analyticsService = require("./analytics.service");
const { callLLM, PROVIDER } = require("./llmProvider");
const logger = require("../utils/logger");

// ─── Helpers ─────────────────────────────────────────────────────────────────
const round = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (a, b) => (b === 0 ? 0 : round(((a - b) / b) * 100));

// Compute weekend vs weekday split for last 30 days
async function getWeekendVsWeekday(userId) {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const data = await Transaction.aggregate([
        { $match: { user: userId, type: "expense", isDeleted: false, date: { $gte: since } } },
        {
            $group: {
                _id: { $in: [{ $dayOfWeek: "$date" }, [1, 7]] }, // Sun=1, Sat=7 in Mongo
                total: { $sum: "$amount" },
                count: { $sum: 1 },
            },
        },
    ]);

    let weekend = 0, weekday = 0;
    data.forEach((d) => (d._id ? (weekend = d.total) : (weekday = d.total)));
    return { weekend: round(weekend), weekday: round(weekday) };
}

// Detect days where spend is > mean + 2*stdDev (z-score > 2) over last 60 days
async function getUnusualDays(userId) {
    const since = new Date();
    since.setDate(since.getDate() - 60);

    const daily = await Transaction.aggregate([
        { $match: { user: userId, type: "expense", isDeleted: false, date: { $gte: since } } },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                total: { $sum: "$amount" },
            },
        },
    ]);
    if (daily.length < 5) return [];

    const totals = daily.map((d) => d.total);
    const mean = totals.reduce((s, x) => s + x, 0) / totals.length;
    const variance = totals.reduce((s, x) => s + (x - mean) ** 2, 0) / totals.length;
    const std = Math.sqrt(variance);
    if (std === 0) return [];

    return daily
        .filter((d) => (d.total - mean) / std > 2)
        .map((d) => ({ date: d._id, amount: round(d.total) }))
        .slice(0, 5);
}

// ─── Snapshot builder ────────────────────────────────────────────────────────
async function buildSnapshot(userId) {
    const [smart, topExpenses, categoryTrend, prediction, weekend, unusual] = await Promise.all([
        analyticsService.getSmartInsights(userId),
        analyticsService.getTopExpenses(userId, 5),
        analyticsService.getCategoryTrend(userId),
        analyticsService.getSpendingPrediction(userId),
        getWeekendVsWeekday(userId),
        getUnusualDays(userId),
    ]);

    // Compress category trend → last-month totals per category
    const lastLabel = categoryTrend.labels[categoryTrend.labels.length - 1];
    const lastIdx = categoryTrend.labels.length - 1;
    const categoryTotals = categoryTrend.datasets
        .map((d) => ({ category: d.label, amount: round(d.data[lastIdx] || 0) }))
        .filter((c) => c.amount > 0)
        .sort((a, b) => b.amount - a.amount)
        .slice(0, 6);

    const topCategory = categoryTotals[0] || null;
    const changePct = pct(smart.currentTotal, smart.prevTotal);

    return {
        period: lastLabel || "current month",
        currentMonthSpend: round(smart.currentTotal),
        previousMonthSpend: round(smart.prevTotal),
        monthOverMonthChangePct: changePct,
        predictedNextMonth: round(prediction.predictedExpense),
        topCategory,
        categoryTotals,
        topExpenses: topExpenses.slice(0, 5).map((e) => ({
            amount: round(e.amount),
            category: e.category,
            description: e.description,
        })),
        weekendVsWeekday: weekend,
        unusualDays: unusual,
    };
}

// ─── Rule-based fallback generator ───────────────────────────────────────────
function generateRuleBasedInsights(snap) {
    const insights = [];

    // 1. Month-over-month change
    if (snap.previousMonthSpend > 0) {
        if (snap.monthOverMonthChangePct > 15) {
            insights.push({
                id: "mom-up",
                title: "Spending Spike",
                message: `Your spending is up ${snap.monthOverMonthChangePct}% vs last month (₹${snap.currentMonthSpend} vs ₹${snap.previousMonthSpend}). Consider reviewing recent expenses.`,
                severity: "warning",
                icon: "trending-up",
            });
        } else if (snap.monthOverMonthChangePct < -10) {
            insights.push({
                id: "mom-down",
                title: "Great Savings",
                message: `You spent ${Math.abs(snap.monthOverMonthChangePct)}% less this month — well done!`,
                severity: "success",
                icon: "piggy-bank",
            });
        } else {
            insights.push({
                id: "mom-stable",
                title: "Stable Spending",
                message: `Your spending is on track (₹${snap.currentMonthSpend}), close to last month's ₹${snap.previousMonthSpend}.`,
                severity: "info",
                icon: "activity",
            });
        }
    }

    // 2. Top category
    if (snap.topCategory) {
        const share = snap.currentMonthSpend > 0
            ? Math.round((snap.topCategory.amount / snap.currentMonthSpend) * 100)
            : 0;
        insights.push({
            id: "top-cat",
            title: "Top Category",
            message: `${snap.topCategory.category} dominates your spending at ₹${snap.topCategory.amount}${share ? ` (${share}% of total)` : ""}.`,
            severity: share > 50 ? "warning" : "info",
            icon: "pie-chart",
        });
    }

    // 3. Budget risk via prediction
    if (snap.predictedNextMonth > snap.currentMonthSpend * 1.1) {
        insights.push({
            id: "budget-risk",
            title: "Budget Risk Ahead",
            message: `Based on your 3-month average, next month's spend may reach ₹${snap.predictedNextMonth}. Plan ahead to avoid overshooting.`,
            severity: "warning",
            icon: "alert-triangle",
        });
    } else if (snap.predictedNextMonth > 0) {
        insights.push({
            id: "budget-ok",
            title: "Predicted Spend",
            message: `Next month's projected spend is ₹${snap.predictedNextMonth} — consistent with your recent pattern.`,
            severity: "info",
            icon: "target",
        });
    }

    // 4. Weekend vs weekday
    const { weekend, weekday } = snap.weekendVsWeekday;
    if (weekend + weekday > 0) {
        const dailyWeekend = weekend / 2;  // 2 days
        const dailyWeekday = weekday / 5;  // 5 days
        if (dailyWeekend > dailyWeekday * 1.5) {
            insights.push({
                id: "weekend-heavy",
                title: "Weekend Splurge",
                message: `You spend ${Math.round((dailyWeekend / dailyWeekday) * 100) / 100}x more per day on weekends. Watch out for impulse weekend buys.`,
                severity: "info",
                icon: "calendar",
            });
        }
    }

    // 5. Unusual days
    if (snap.unusualDays.length > 0) {
        const biggest = snap.unusualDays[0];
        insights.push({
            id: "unusual",
            title: "Unusual Spending Day",
            message: `${biggest.date} stood out with ₹${biggest.amount} spent — significantly above your daily average.`,
            severity: "warning",
            icon: "zap",
        });
    }

    // 6. Savings insight (if income exists, but we only have expenses here — keep generic)
    if (snap.currentMonthSpend < snap.previousMonthSpend && snap.previousMonthSpend > 0) {
        const saved = round(snap.previousMonthSpend - snap.currentMonthSpend);
        insights.push({
            id: "savings",
            title: "Money Saved",
            message: `You've saved ₹${saved} compared to last month. Consider moving it to savings!`,
            severity: "success",
            icon: "piggy-bank",
        });
    }

    return {
        insights: insights.slice(0, 6),
        summary: insights[0]?.message || "Keep tracking your expenses to unlock personalised insights.",
    };
}

// ─── LLM prompt builder & parser ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are a concise, friendly personal finance analyst.
Given a JSON snapshot of a user's recent spending, produce 4 to 6 actionable insights.
Output STRICT JSON ONLY, no markdown, in this exact shape:
{
  "summary": "one-sentence overall summary",
  "insights": [
    {
      "id": "kebab-case-id",
      "title": "Short Title (max 4 words)",
      "message": "1-2 sentence insight referencing concrete numbers from the snapshot.",
      "severity": "info" | "success" | "warning" | "danger",
      "icon": "trending-up" | "trending-down" | "pie-chart" | "alert-triangle" | "piggy-bank" | "calendar" | "zap" | "target" | "activity"
    }
  ]
}
Rules: never invent numbers, always reference real snapshot values, currency is INR (₹).`;

function parseLLMOutput(raw) {
    if (!raw || typeof raw !== "string") return null;
    try {
        // Strip optional code fences just in case
        const cleaned = raw.trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
        const parsed = JSON.parse(cleaned);
        if (!Array.isArray(parsed.insights) || parsed.insights.length === 0) return null;
        // Light sanitisation
        parsed.insights = parsed.insights.slice(0, 6).map((i, idx) => ({
            id: String(i.id || `ai-${idx}`),
            title: String(i.title || "Insight"),
            message: String(i.message || ""),
            severity: ["info", "success", "warning", "danger"].includes(i.severity) ? i.severity : "info",
            icon: String(i.icon || "activity"),
        }));
        parsed.summary = String(parsed.summary || parsed.insights[0].message);
        return parsed;
    } catch (err) {
        logger.warn("[AI] Failed to parse LLM JSON output:", err.message);
        return null;
    }
}

// ─── Main entry ──────────────────────────────────────────────────────────────
async function generateInsights(userId) {
    const snapshot = await buildSnapshot(userId);

    // Try LLM first
    const userPrompt = `Snapshot:\n${JSON.stringify(snapshot, null, 2)}`;
    const raw = await callLLM(SYSTEM_PROMPT, userPrompt);
    const parsed = parseLLMOutput(raw);

    if (parsed) {
        return {
            insights: parsed.insights,
            summary: parsed.summary,
            snapshot,
            source: "llm",
            provider: PROVIDER,
            generatedAt: new Date().toISOString(),
        };
    }

    // Fallback: rule-based
    const ruled = generateRuleBasedInsights(snapshot);
    return {
        insights: ruled.insights,
        summary: ruled.summary,
        snapshot,
        source: "rules",
        provider: null,
        generatedAt: new Date().toISOString(),
    };
}

module.exports = { generateInsights, buildSnapshot };
