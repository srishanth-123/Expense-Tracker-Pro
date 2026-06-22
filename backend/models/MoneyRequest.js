const mongoose = require("mongoose");

const moneyRequestSchema = new mongoose.Schema({
    requester: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    payer: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    status: {
        type: String,
        enum: ["PENDING", "ACCEPTED", "REJECTED", "CANCELLED"],
        default: "PENDING"
    },
    notes: {
        type: String,
        trim: true
    }
}, { timestamps: true });

moneyRequestSchema.index({ requester: 1, status: 1 });
moneyRequestSchema.index({ payer: 1, status: 1 });

module.exports = mongoose.model("MoneyRequest", moneyRequestSchema);
