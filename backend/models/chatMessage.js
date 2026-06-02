const mongoose = require("mongoose");

const chatMessageSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
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
}, { timestamps: true });

chatMessageSchema.index({ user: 1, createdAt: 1 });

module.exports = mongoose.model("ChatMessage", chatMessageSchema);
