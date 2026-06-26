const mongoose = require("mongoose");

const savingsGoalSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        name: {
            type: String,
            required: [true, "Goal name is required"],
            trim: true,
            maxlength: [100, "Goal name must be at most 100 characters"],
        },
        targetAmount: {
            type: Number,
            required: [true, "Target amount is required"],
            min: [1, "Target amount must be at least ₹1"],
        },
        currentAmount: {
            type: Number,
            default: 0,
            min: [0, "Current amount cannot be negative"],
        },
        deadline: {
            type: Date,
            default: null,
        },
        icon: {
            type: String,
            default: "🎯", // Emoji icon
        },
        color: {
            type: String,
            default: "#6366f1",
        },
        isCompleted: {
            type: Boolean,
            default: false,
        },
        completedAt: {
            type: Date,
            default: null,
        }
    },
    { timestamps: true }
);

savingsGoalSchema.index({ user: 1, isCompleted: 1 });

module.exports = mongoose.model("SavingsGoal", savingsGoalSchema);
