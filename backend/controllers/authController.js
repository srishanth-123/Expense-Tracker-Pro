const User = require("../models/user");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const generateToken = require("../utils/generateToken");
const logger = require("../utils/logger");
const redis = require("../config/redis");
const { sendWelcomeEmail, sendPasswordResetEmail } = require("../services/emailService");

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_SECONDS = 15 * 60; // 15 minutes
const PASSWORD_RESET_EXPIRY_MINUTES = 15;

// ─── Helpers ──────────────────────────────────────────────────────────────────
const sendTokenCookie = (res, token) => {
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000  // 30 days
    });
};

const getLoginFailKey = (email) => `login_fail:${email.toLowerCase()}`;

// ─── Register ─────────────────────────────────────────────────────────────────
exports.registerUser = async (req, res) => {
    try {
        const { name, email, password } = req.body;

        const userExists = await User.findOne({ email });
        if (userExists) {
            return res.status(400).json({ success: false, message: "User already exists" });
        }

        const salt = await bcrypt.genSalt(10);
        const hashed = await bcrypt.hash(password, salt);

        const user = await User.create({ name, email, password: hashed });
        const token = generateToken(user.id);

        sendWelcomeEmail(user);

        sendTokenCookie(res, token);

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: { _id: user.id, name: user.name, email: user.email, token }
        });
    } catch (error) {
        logger.error("Registration error:", error);
        res.status(500).json({ success: false, message: "Server error during registration" });
    }
};

// ─── Login ────────────────────────────────────────────────────────────────────
exports.loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const failKey = getLoginFailKey(email);

        // Check account lockout via Redis
        if (redis) {
            const attempts = await redis.get(failKey);
            if (attempts && parseInt(attempts) >= MAX_LOGIN_ATTEMPTS) {
                const ttl = await redis.ttl(failKey);
                const minutes = Math.ceil(ttl / 60);
                logger.warn(`Account locked for ${email} — ${attempts} failed attempts`);
                return res.status(429).json({
                    success: false,
                    message: `Account temporarily locked. Try again in ${minutes} minute${minutes !== 1 ? 's' : ''}.`
                });
            }
        }

        const user = await User.findOne({ email });
        if (!user) {
            // Record failed attempt (even for non-existent users to prevent enumeration)
            if (redis) {
                await redis.incr(failKey);
                await redis.expire(failKey, LOCK_DURATION_SECONDS);
            }
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            if (redis) {
                const attempts = await redis.incr(failKey);
                await redis.expire(failKey, LOCK_DURATION_SECONDS);
                const remaining = MAX_LOGIN_ATTEMPTS - attempts;
                if (remaining <= 0) {
                    logger.warn(`Account locked: ${email} after ${attempts} failed attempts`);
                    return res.status(429).json({
                        success: false,
                        message: "Too many failed attempts. Account locked for 15 minutes."
                    });
                }
                return res.status(401).json({
                    success: false,
                    message: `Invalid credentials. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
                });
            }
            return res.status(401).json({ success: false, message: "Invalid credentials" });
        }

        // Successful login — clear fail counter
        if (redis) await redis.del(failKey);

        const token = generateToken(user.id);
        sendTokenCookie(res, token);

        res.json({
            success: true,
            message: "Login successful",
            data: { _id: user.id, name: user.name, email: user.email, token }
        });
    } catch (error) {
        logger.error("Login error:", error);
        res.status(500).json({ success: false, message: "Server error during login" });
    }
};

// ─── Forgot Password ──────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const genericResponse = {
            success: true,
            message: "If an account exists for this email, a reset link has been sent."
        };

        const user = await User.findOne({ email });
        if (!user) return res.json(genericResponse);

        const resetToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

        user.passwordResetToken = hashedToken;
        user.passwordResetExpires = Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000;
        await user.save({ validateBeforeSave: false });

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const resetUrl = `${frontendUrl}/reset-password/${resetToken}`;

        sendPasswordResetEmail(user, resetUrl, PASSWORD_RESET_EXPIRY_MINUTES);

        res.json(genericResponse);
    } catch (error) {
        logger.error("Forgot password error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Reset Password ───────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid or expired reset token" });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(password, salt);
        user.passwordResetToken = null;
        user.passwordResetExpires = null;
        await user.save();

        res.json({ success: true, message: "Password reset successful" });
    } catch (error) {
        logger.error("Reset password error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logoutUser = (req, res) => {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax"
    });
    res.json({ success: true, message: "Logged out successfully" });
};

// ─── Get Profile ──────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("-password");
        if (!user) {
            return res.status(404).json({ success: false, message: "User not found" });
        }
        res.json({ success: true, message: "User retrieved", data: user });
    } catch (error) {
        logger.error("Get profile error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Search Users ─────────────────────────────────────────────────────────────
exports.searchUsers = async (req, res) => {
    try {
        const { query } = req.query;
        if (!query) return res.json({ success: true, data: [] });

        // Search by exact email or partial name (case insensitive), limit to 10
        const users = await User.find({
            $or: [
                { email: { $regex: query, $options: "i" } },
                { name: { $regex: query, $options: "i" } }
            ],
            _id: { $ne: req.user._id } // Don't return the searcher themselves
        }).select("_id name email").limit(10);

        res.json({ success: true, message: "Users found", data: users });
    } catch (error) {
        logger.error("User search error:", error);
        res.status(500).json({ success: false, message: "Server error during search" });
    }
};
