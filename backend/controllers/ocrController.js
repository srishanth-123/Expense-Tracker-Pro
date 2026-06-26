const { callLLMWithImage } = require("../services/llmProvider");
const Category = require("../models/category");
const { createAuditLog } = require("../utils/auditLog");
const logger = require("../utils/logger");

/**
 * POST /api/v1/ocr/scan
 * Body: { image: "data:image/jpeg;base64,..." }
 * Enforces requirePro middleware, extracts transaction details from base64 image using LLM vision.
 */
exports.scanReceipt = async (req, res) => {
    try {
        const { image } = req.body;
        if (!image) {
            return res.status(400).json({ success: false, message: "Receipt image is required (base64 string)." });
        }

        // Enforce Pro check (as defense-in-depth, route already has requirePro)
        if (req.user.plan !== "PRO" && !req.user.isPro) {
            return res.status(403).json({ success: false, message: "Receipt OCR scanning is a premium PRO feature." });
        }

        // Parse base64 header
        let mimeType = "image/jpeg";
        let base64Data = image;

        if (image.startsWith("data:")) {
            const matches = image.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
            if (matches && matches.length === 3) {
                mimeType = matches[1];
                base64Data = matches[2];
            } else {
                return res.status(400).json({ success: false, message: "Invalid base64 image format." });
            }
        }

        // Fetch user categories to pass to the LLM for custom classification
        const categories = await Category.find({ user: req.user._id, isDeleted: false }).select("name").lean();
        const categoryList = categories.map(c => c.name);
        const systemCategories = ["Food", "Utilities", "Transport", "Entertainment", "Shopping", "Health", "Travel", "Salary", "Other"];
        const combinedCategories = Array.from(new Set([...categoryList, ...systemCategories]));

        const systemPrompt = `You are a professional financial assistant receipt parser.
Extract the transaction details from the receipt image and return them as a strict JSON object.
Return ONLY valid JSON. Do not include markdown code block formatting (like \`\`\`json). Just the raw JSON.

The response JSON must match this structure:
{
  "merchantName": "Name of the merchant/store (string, e.g., 'Walmart')",
  "amount": "Total transaction amount as a number (number, e.g., 42.50)",
  "date": "Transaction date in 'YYYY-MM-DD' format (string, use current date '${new Date().toISOString().split('T')[0]}' if not legible)",
  "category": "Suggested category string. Select the best match from this list: [${combinedCategories.join(", ")}]",
  "description": "Brief summary of the purchase (string, e.g., 'Office supplies & coffee')",
  "items": [
    { "description": "Individual item name (string)", "price": "Item cost (number)" }
  ]
}

Ensure all numbers are parsed properly and categories are matched to the provided list as closely as possible.`;

        const userPrompt = "Identify the merchant name, total expense amount, transaction date, and line items from this receipt image.";

        logger.info(`[OCR] Parsing receipt image for user ${req.user._id} using vision model...`);
        const rawResponse = await callLLMWithImage(systemPrompt, userPrompt, base64Data, mimeType, true);

        if (!rawResponse) {
            return res.status(500).json({ success: false, message: "Vision model failed to parse the receipt. Please try again." });
        }

        // Clean output in case LLM added markdown backticks
        let cleanJson = rawResponse.trim();
        if (cleanJson.startsWith("```")) {
            cleanJson = cleanJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
        }

        let result;
        try {
            result = JSON.parse(cleanJson);
        } catch (jsonErr) {
            logger.error(`[OCR] Failed to parse JSON returned by LLM: ${cleanJson}. Error: ${jsonErr.message}`);
            return res.status(500).json({ success: false, message: "Failed to parse receipt data format. Please try again." });
        }

        // Format dates and validate fields
        result.amount = Number(result.amount) || 0;
        if (result.items && Array.isArray(result.items)) {
            result.items = result.items.map(item => ({
                description: item.description || "Item",
                price: Number(item.price) || 0
            }));
        } else {
            result.items = [];
        }

        // Log security action in audit log
        createAuditLog(
            req.user._id,
            "RECEIPT_OCR_SCAN",
            req,
            `Successfully scanned receipt from merchant: ${result.merchantName || "Unknown"} (Amount: ₹${result.amount})`
        );

        res.json({
            success: true,
            message: "Receipt scanned successfully",
            data: result
        });

    } catch (error) {
        logger.error("[OCR Controller Error]:", error);
        res.status(500).json({ success: false, message: "Server error during receipt scanning." });
    }
};
