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
    description: {
        type: String,
        required: true
    },
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        share: {
            type: Number,
            required: true
        },
        paid: {
            type: Boolean,
            default: false
        }
    }],
    splitType: {
        type: String,
        enum: ["equal", "custom"],
        required: true
    }
}, { timestamps: true });

splitSchema.index({ "participants.user": 1 });
splitSchema.index({ paidBy: 1 });

module.exports = mongoose.model("Split", splitSchema);
