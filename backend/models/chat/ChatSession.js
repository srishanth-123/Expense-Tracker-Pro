const mongoose = require("mongoose");

const chatSessionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        title: {
            type: String,
            default: "New Conversation"
        },
        summary: {
            type: String,
            default: ""
        },
        isActive: {
            type: Boolean,
            default: true
        }
    },
    { timestamps: true }
);

chatSessionSchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model("ChatSession", chatSessionSchema);
