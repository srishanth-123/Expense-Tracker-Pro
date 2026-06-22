const mongoose = require("mongoose");

const splitSchema = new mongoose.Schema({
    amount: {
        type: Number,
        required: true
    },
    paidBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Category",
        default: null
    },
    description: {
        type: String,
        required: true
    },
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },
        email: {
            type: String,
            lowercase: true,
            trim: true
        },
        name: {
            type: String,
            trim: true
        },
        share: {
            type: Number,
            required: true
        },
        percentage: {
            type: Number,
            default: 0
        },
        paid: {
            type: Boolean,
            default: false
        },
        status: {
            type: String,
            enum: ["pending", "paid", "unregistered"],
            default: "pending"
        }
    }],
    splitType: {
        type: String,
        enum: ["equal", "custom", "percentage"],
        required: true
    },
    status: {
        type: String,
        enum: ["pending", "settled"],
        default: "pending"
    }
}, { timestamps: true });

splitSchema.index({ "participants.user": 1 });
splitSchema.index({ paidBy: 1 });

module.exports = mongoose.model("Split", splitSchema);
