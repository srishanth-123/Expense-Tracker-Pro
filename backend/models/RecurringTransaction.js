const mongoose = require("mongoose");

const recurringTransactionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        type: {
            type: String,
            enum: ["income", "expense"],
            required: true,
        },
        amount: {
            type: Number,
            required: true,
            min: [0.01, "Amount must be positive"],
        },
        category: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Category",
            required: true,
        },
        description: {
            type: String,
            default: "",
            trim: true,
        },
        frequency: {
            type: String,
            enum: ["daily", "weekly", "monthly", "yearly"],
            required: true,
        },
        startDate: {
            type: Date,
            required: true,
        },
        endDate: {
            type: Date,
            default: null, // null means no end date
        },
        nextRunDate: {
            type: Date,
            required: true,
        },
        isActive: {
            type: Boolean,
            default: true,
        },
        lastRunDate: {
            type: Date,
            default: null,
        },
        totalGenerated: {
            type: Number,
            default: 0,
        }
    },
    { timestamps: true }
);

recurringTransactionSchema.index({ user: 1, isActive: 1 });
recurringTransactionSchema.index({ nextRunDate: 1, isActive: 1 });

module.exports = mongoose.model("RecurringTransaction", recurringTransactionSchema);
