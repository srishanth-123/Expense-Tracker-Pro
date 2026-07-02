const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
    token: { type: String, required: true },
    device: { type: String, default: "Unknown" },
    browser: { type: String, default: "Unknown" },
    ip: { type: String, default: "Unknown" },
    loginAt: { type: Date, default: Date.now },
    lastActive: { type: Date, default: Date.now }
}, { _id: true });

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
        },
        plan: {
            type: String,
            enum: ["FREE", "PRO"],
            default: "FREE"
        },
        subscriptionStatus: {
            type: String,
            enum: ["ACTIVE", "EXPIRED", "CANCELLED"],
            default: "EXPIRED"
        },
        subscriptionStartDate: {
            type: Date,
            default: null
        },
        subscriptionEndDate: {
            type: Date,
            default: null
        },
        lastPaymentId: {
            type: String,
            default: null
        },
        profilePic: {
            type: String,
            default: ""
        },
        passwordResetToken: {
            type: String,
            default: null
        },
        passwordResetExpires: {
            type: Date,
            default: null
        },
        // ─── Email Verification ───────────────────────────────────────────
        emailVerified: {
            type: Boolean,
            default: false
        },
        emailVerificationToken: {
            type: String,
            default: null
        },
        emailVerificationExpires: {
            type: Date,
            default: null
        },
        // ─── Session Management ───────────────────────────────────────────
        activeSessions: {
            type: [sessionSchema],
            default: []
        }
    },
    { timestamps: true }
);

userSchema.index({ name: 1 });

// unique: true on email already creates an index — no need for explicit schema.index()

// Pre-save hook to keep `isPro` backwards compatible
userSchema.pre("save", function() {
    if (this.plan === "PRO" && this.subscriptionStatus === "ACTIVE") {
        this.isPro = true;
    } else if (this.isPro === true) {
        this.plan = "PRO";
        this.subscriptionStatus = "ACTIVE";
        if (!this.subscriptionEndDate) {
            const farFuture = new Date();
            farFuture.setFullYear(farFuture.getFullYear() + 10);
            this.subscriptionEndDate = farFuture;
        }
    } else {
        this.isPro = false;
        this.plan = "FREE";
        this.subscriptionStatus = "EXPIRED";
    }
});

// ─── Post-save hook: bust the 30s auth middleware user cache ──────────────────
// This fires after any user.save() call so stale walletBalance / plan data
// doesn't linger in the cache after mutations.
userSchema.post("save", function(doc) {
    try {
        const { invalidateUserCache } = require("../middleware/authMiddleware");
        invalidateUserCache(doc._id);
    } catch (_) {}
});

// Also bust after findOneAndUpdate / findByIdAndUpdate (saga service uses these)
userSchema.post("findOneAndUpdate", function(doc) {
    if (doc) {
        try {
            const { invalidateUserCache } = require("../middleware/authMiddleware");
            invalidateUserCache(doc._id);
        } catch (_) {}
    }
});

userSchema.post("updateOne", function() {
    // updateOne doesn't return the doc, so we can't get the _id here.
    // For the rare cases that use updateOne directly, the 30s TTL is acceptable.
});

module.exports = mongoose.model("User", userSchema);
