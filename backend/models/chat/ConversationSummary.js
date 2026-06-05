const mongoose = require("mongoose");

const conversationSummarySchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        session: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "ChatSession",
            required: true
        },
        summary: {
            type: String,
            required: true
        },
        keyPoints: [
            {
                type: String
            }
        ]
    },
    { timestamps: true }
);

conversationSummarySchema.index({ session: 1 });

module.exports = mongoose.model("ConversationSummary", conversationSummarySchema);
