const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema(
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
        role: {
            type: String,
            enum: ["user", "model"],
            required: true
        },
        content: {
            type: String,
            required: true
        }
    },
    { timestamps: true }
);

chatMessageSchema.index({ session: 1, createdAt: 1 });

module.exports = mongoose.models.SessionChatMessage || mongoose.model("SessionChatMessage", chatMessageSchema);
