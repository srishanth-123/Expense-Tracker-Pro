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

const sendTokenCookie = (res, token) => {
    let maxAge = 24 * 60 * 60 * 1000; // 24 hours default
    const expire = process.env.JWT_EXPIRE || "24h";
    const num = parseInt(expire);
    const unit = expire.slice(String(num).length);
    if (!isNaN(num)) {
        if (unit === 'h') maxAge = num * 60 * 60 * 1000;
        else if (unit === 'd') maxAge = num * 24 * 60 * 60 * 1000;
        else if (unit === 'm') maxAge = num * 60 * 1000;
    }

    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
        maxAge
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

        // Auto-link unregistered splits matching this user's email
        try {
            const Split = require("../models/split");
            const userEmail = email.toLowerCase().trim();
            const matchingSplits = await Split.find({
                "participants.email": userEmail,
                "participants.status": "unregistered"
            });

            for (const split of matchingSplits) {
                let updated = false;
                for (const p of split.participants) {
                    if (p.email?.toLowerCase() === userEmail && p.status === "unregistered") {
                        p.user = user._id;
                        p.status = p.paid ? "paid" : "pending";
                        updated = true;
                    }
                }
                if (updated) {
                    split.status = split.participants.every(p => p.paid) ? "settled" : "pending";
                    await split.save();

                    if (redis) {
                        try {
                            const analyticsKeys = await redis.keys(`analytics:*:${split.paidBy}*`);
                            const transactionKeys = await redis.keys(`transactions:${split.paidBy}:*`);
                            const budgetKeys = await redis.keys(`checkBudgets:${split.paidBy}:*`);
                            const allKeys = [...analyticsKeys, ...transactionKeys, ...budgetKeys];
                            if (allKeys.length > 0) await redis.del(...allKeys);
                        } catch (_) {}
                    }
                }
            }

            if (redis) {
                try {
                    const analyticsKeys = await redis.keys(`analytics:*:${user._id}*`);
                    const transactionKeys = await redis.keys(`transactions:${user._id}:*`);
                    const budgetKeys = await redis.keys(`checkBudgets:${user._id}:*`);
                    const allKeys = [...analyticsKeys, ...transactionKeys, ...budgetKeys];
                    if (allKeys.length > 0) await redis.del(...allKeys);
                } catch (_) {}
            }
        } catch (linkErr) {
            logger.error("Error auto-linking splits during registration:", linkErr);
        }

        const token = generateToken(user.id);

        sendWelcomeEmail(user);

        sendTokenCookie(res, token);

        res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: { 
                _id: user.id, 
                name: user.name, 
                email: user.email, 
                isPro: user.isPro, 
                plan: user.plan,
                subscriptionStatus: user.subscriptionStatus,
                subscriptionEndDate: user.subscriptionEndDate,
                walletBalance: user.walletBalance, 
                profilePic: user.profilePic || "",
                token 
            }
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

        // Auto-expiry check
        if (user.plan === "PRO" && user.subscriptionEndDate && new Date() > user.subscriptionEndDate) {
            user.plan = "FREE";
            user.subscriptionStatus = "EXPIRED";
            await user.save();
        }

        const token = generateToken(user.id);
        sendTokenCookie(res, token);

        res.json({
            success: true,
            message: "Login successful",
            data: { 
                _id: user.id, 
                name: user.name, 
                email: user.email, 
                isPro: user.isPro,
                plan: user.plan,
                subscriptionStatus: user.subscriptionStatus,
                subscriptionEndDate: user.subscriptionEndDate,
                walletBalance: user.walletBalance, 
                profilePic: user.profilePic || "",
                token 
            }
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

        if (process.env.NODE_ENV !== "production") {
            genericResponse.resetUrl = resetUrl;
        }

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
        if (!query || !query.trim()) return res.json({ success: true, data: [] });

        const cleanQuery = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

        // Prefix-anchored (^) so the query can use the name/email index instead
        // of scanning the whole collection. limited to 10 results.
        const prefix = new RegExp(`^${cleanQuery}`, "i");
        const users = await User.find({
            $or: [
                { name: { $regex: prefix } },
                { email: { $regex: prefix } }
            ],
            _id: { $ne: req.user._id } // Don't return the searcher themselves
        }).select("_id name email").limit(10);

        res.json({ success: true, message: "Users found", data: users });
    } catch (error) {
        logger.error("User search error:", error);
        res.status(500).json({ success: false, message: "Server error during search" });
    }
};

// ─── Update Profile ───────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
    try {
        const { name, email, profilePic } = req.body;
        const userId = req.user._id;
        const updateData = {};

        // Validate name
        if (name !== undefined) {
            const trimmed = name.trim();
            if (trimmed.length < 2 || trimmed.length > 50) {
                return res.status(400).json({ success: false, message: "Name must be between 2 and 50 characters." });
            }
            updateData.name = trimmed;
        }

        // Validate email
        if (email !== undefined) {
            const trimmedEmail = email.trim().toLowerCase();
            if (!/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
                return res.status(400).json({ success: false, message: "Please enter a valid email address." });
            }
            if (!trimmedEmail.endsWith('@gmail.com')) {
                return res.status(400).json({ success: false, message: "Only Gmail addresses (@gmail.com) are allowed." });
            }
            // Check for duplicate
            const existing = await User.findOne({ email: trimmedEmail, _id: { $ne: userId } });
            if (existing) {
                return res.status(400).json({ success: false, message: "This email is already in use by another account." });
            }
            updateData.email = trimmedEmail;
        }

        // Validate profile picture (Base64 JPEG only)
        if (profilePic !== undefined) {
            if (profilePic === "") {
                // Allow clearing the profile pic
                updateData.profilePic = "";
            } else {
                if (!profilePic.startsWith("data:image/jpeg;base64,") && !profilePic.startsWith("data:image/jpg;base64,")) {
                    return res.status(400).json({ success: false, message: "Only JPEG/JPG images are allowed." });
                }
                // Check size — limit to ~2MB base64 (~2.7M characters)
                if (profilePic.length > 2700000) {
                    return res.status(400).json({ success: false, message: "Image size must be less than 2MB." });
                }
                updateData.profilePic = profilePic;
            }
        }

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ success: false, message: "No valid fields to update." });
        }

        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true }).select("-password");

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // Send system notification for profile update
        try {
            const Notification = require("../models/notificationModel");
            const { sendNotificationToUser } = require("../utils/socket");
            const fields = Object.keys(updateData).filter(k => k !== "profilePic").join(", ");
            const picChanged = updateData.profilePic !== undefined;
            let msg = "Profile updated: ";
            if (fields) msg += fields;
            if (picChanged) msg += (fields ? " and " : "") + "profile picture";
            msg += " changed successfully.";
            const notif = await Notification.create({ user: userId, type: "SYSTEM", message: msg });
            sendNotificationToUser(userId, notif);
        } catch (_) {}

        res.json({ success: true, message: "Profile updated successfully.", data: updatedUser });
    } catch (error) {
        logger.error("Update profile error:", error);
        res.status(500).json({ success: false, message: "Server error during profile update." });
    }
};
