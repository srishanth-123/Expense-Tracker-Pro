const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, "Name is required"],
            trim: true,
            minlength: [2, "Name must be at least 2 characters"],
            maxlength: [50, "Name must be at most 50 characters"]
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true,
            match: [/^\S+@\S+\.\S+$/, "Please enter a valid email address"]
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            minlength: [8, "Password must be at least 8 characters"]
        },
        walletBalance: {
            type: Number,
            default: 0,
            min: [0, "Wallet balance cannot be negative"]
        },
        // For account lockout (brute force protection)
        loginAttempts: {
            type: Number,
            default: 0
        },
        lockUntil: {
            type: Date,
            default: null
        },
        isPro: {
            type: Boolean,
            default: false
        }
    },
    { timestamps: true }
);

// unique: true on email already creates an index — no need for explicit schema.index()

module.exports = mongoose.model("User", userSchema);

