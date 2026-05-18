const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: true
    },
    amount: {
        type: Number,
        required: true
    },
    orderId: {
        type: String,
        required: true,
        unique: true
    },
    paymentId: {
        type: String
    },
    status: {
        type: String,
        enum: ["pending", "success", "failed"],
        default: "pending"
    }
}, { timestamps: true });

module.exports = mongoose.model("Payment", paymentSchema);
