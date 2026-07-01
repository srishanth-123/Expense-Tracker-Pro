const User = require("../models/user");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const generateToken = require("../utils/generateToken");
const logger = require("../utils/logger");
const redis = require("../config/redis");
const { sendWelcomeEmail, sendPasswordResetEmail, sendVerificationEmail, sendSecurityAlertEmail } = require("../services/emailService");
const { createAuditLog, parseUserAgent } = require("../utils/auditLog");
const { markFinancialDataChanged, markBudgetChanged } = require("../utils/cacheHelpers");

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_DURATION_SECONDS = 15 * 60; // 15 minutes
const PASSWORD_RESET_EXPIRY_MINUTES = 15;
const EMAIL_VERIFICATION_EXPIRY_MINUTES = 60;
const MAX_SESSIONS = 5; // Max concurrent sessions per user

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
        
        // Generate email verification token
        const verificationToken = crypto.randomBytes(32).toString("hex");
        const hashedVerificationToken = crypto.createHash("sha256").update(verificationToken).digest("hex");
        
        const user = await User.create({ 
            name, 
            email, 
            password: hashed,
            emailVerified: false,
            emailVerificationToken: hashedVerificationToken,
            emailVerificationExpires: Date.now() + EMAIL_VERIFICATION_EXPIRY_MINUTES * 60 * 1000
        });

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
                            await markFinancialDataChanged(split.paidBy);
                            await redis.del(`transactions:${split.paidBy}:list`);
                            await markBudgetChanged(split.paidBy);
                        } catch (_) {}
                    }
                }
            }

            if (redis) {
                try {
                    await markFinancialDataChanged(user._id);
                    await redis.del(`transactions:${user._id}:list`);
                    await markBudgetChanged(user._id);
                } catch (_) {}
            }
        } catch (linkErr) {
            logger.error("Error auto-linking splits during registration:", linkErr);
        }

        const token = generateToken(user.id);

        // Create session
        const { device, browser } = parseUserAgent(req.headers["user-agent"]);
        user.activeSessions = [{
            token,
            device,
            browser,
            ip: req.ip || "Unknown",
            loginAt: new Date(),
            lastActive: new Date()
        }];
        await user.save({ validateBeforeSave: false });

        sendWelcomeEmail(user);
        
        // Send verification email
        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const verifyUrl = `${frontendUrl}/verify-email/${verificationToken}`;
        sendVerificationEmail(user, verifyUrl, EMAIL_VERIFICATION_EXPIRY_MINUTES);

        sendTokenCookie(res, token);

        // Audit log
        createAuditLog(user.id, "REGISTER", req, `New account registered: ${email}`);

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
                emailVerified: user.emailVerified,
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
                    createAuditLog(user._id, "LOGIN_FAILED", req, `Account locked after ${attempts} attempts`);
                    return res.status(429).json({
                        success: false,
                        message: "Too many failed attempts. Account locked for 15 minutes."
                    });
                }
                createAuditLog(user._id, "LOGIN_FAILED", req, `Failed login attempt (${attempts}/${MAX_LOGIN_ATTEMPTS})`);
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
        
        // Session management — track this login
        const { device, browser } = parseUserAgent(req.headers["user-agent"]);
        const newSession = {
            token,
            device,
            browser,
            ip: req.ip || "Unknown",
            loginAt: new Date(),
            lastActive: new Date()
        };
        
        // Keep only last MAX_SESSIONS sessions (FIFO)
        if (!user.activeSessions) user.activeSessions = [];
        if (user.activeSessions.length >= MAX_SESSIONS) {
            user.activeSessions = user.activeSessions.slice(-MAX_SESSIONS + 1);
        }
        user.activeSessions.push(newSession);
        await user.save({ validateBeforeSave: false });

        sendTokenCookie(res, token);

        // Audit log
        createAuditLog(user._id, "LOGIN", req, `Login from ${device} / ${browser}`);

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
                emailVerified: user.emailVerified,
                token 
            }
        });
    } catch (error) {
        logger.error("Login error:", error);
        res.status(500).json({ success: false, message: "Server error during login" });
    }
};

// ─── Verify Email ─────────────────────────────────────────────────────────────
exports.verifyEmail = async (req, res) => {
    try {
        const { token } = req.params;
        const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
        
        const user = await User.findOne({
            emailVerificationToken: hashedToken,
            emailVerificationExpires: { $gt: Date.now() }
        });

        if (!user) {
            return res.status(400).json({ success: false, message: "Invalid or expired verification link" });
        }

        user.emailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpires = null;
        await user.save({ validateBeforeSave: false });

        createAuditLog(user._id, "EMAIL_VERIFIED", req, "Email verified successfully");

        res.json({ success: true, message: "Email verified successfully" });
    } catch (error) {
        logger.error("Email verification error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Resend Verification Email ────────────────────────────────────────────────
exports.resendVerificationEmail = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        
        if (user.emailVerified) {
            return res.status(400).json({ success: false, message: "Email is already verified" });
        }

        const verificationToken = crypto.randomBytes(32).toString("hex");
        const hashedToken = crypto.createHash("sha256").update(verificationToken).digest("hex");

        user.emailVerificationToken = hashedToken;
        user.emailVerificationExpires = Date.now() + EMAIL_VERIFICATION_EXPIRY_MINUTES * 60 * 1000;
        await user.save({ validateBeforeSave: false });

        const frontendUrl = process.env.FRONTEND_URL || "http://localhost:5173";
        const verifyUrl = `${frontendUrl}/verify-email/${verificationToken}`;
        sendVerificationEmail(user, verifyUrl, EMAIL_VERIFICATION_EXPIRY_MINUTES);

        res.json({ success: true, message: "Verification email sent" });
    } catch (error) {
        logger.error("Resend verification email error:", error);
        res.status(500).json({ success: false, message: "Server error" });
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
        createAuditLog(user._id, "PASSWORD_RESET_REQUEST", req, "Password reset link requested");

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
        // Invalidate all sessions on password reset
        user.activeSessions = [];
        await user.save();

        createAuditLog(user._id, "PASSWORD_RESET_COMPLETE", req, "Password reset completed — all sessions revoked");

        res.json({ success: true, message: "Password reset successful" });
    } catch (error) {
        logger.error("Reset password error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Change Password (authenticated) ─────────────────────────────────────────
exports.changePassword = async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!currentPassword || !newPassword) {
            return res.status(400).json({ success: false, message: "Current password and new password are required" });
        }

        if (newPassword.length < 8) {
            return res.status(400).json({ success: false, message: "New password must be at least 8 characters" });
        }

        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ success: false, message: "User not found" });

        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ success: false, message: "Current password is incorrect" });
        }

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        await user.save();

        createAuditLog(user._id, "PASSWORD_CHANGE", req, "Password changed via profile settings");
        
        // Send security alert
        const { device } = parseUserAgent(req.headers["user-agent"]);
        sendSecurityAlertEmail(user, {
            action: "Password Changed",
            device,
            ip: req.ip,
            time: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })
        });

        res.json({ success: true, message: "Password changed successfully" });
    } catch (error) {
        logger.error("Change password error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
exports.logoutUser = async (req, res) => {
    try {
        // Remove current session from active sessions
        const token = req.cookies?.token || (req.headers.authorization?.startsWith('Bearer') ? req.headers.authorization.split(' ')[1] : null);
        if (token && req.user) {
            await User.findByIdAndUpdate(req.user._id, {
                $pull: { activeSessions: { token } }
            });
            createAuditLog(req.user._id, "LOGOUT", req, "User logged out");
        }
    } catch (err) {
        logger.error("Error removing session on logout:", err.message);
    }

    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax"
    });
    res.json({ success: true, message: "Logged out successfully" });
};

// ─── Logout All Devices ───────────────────────────────────────────────────────
exports.logoutAllDevices = async (req, res) => {
    try {
        await User.findByIdAndUpdate(req.user._id, { activeSessions: [] });
        createAuditLog(req.user._id, "LOGOUT_ALL_DEVICES", req, "All sessions revoked");

        res.clearCookie("token", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax"
        });
        res.json({ success: true, message: "Logged out from all devices successfully" });
    } catch (error) {
        logger.error("Logout all devices error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Revoke Specific Session ──────────────────────────────────────────────────
exports.revokeSession = async (req, res) => {
    try {
        const { sessionId } = req.params;
        await User.findByIdAndUpdate(req.user._id, {
            $pull: { activeSessions: { _id: sessionId } }
        });
        createAuditLog(req.user._id, "SESSION_REVOKED", req, `Session ${sessionId} revoked`);
        res.json({ success: true, message: "Session revoked successfully" });
    } catch (error) {
        logger.error("Revoke session error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Get Active Sessions ──────────────────────────────────────────────────────
exports.getActiveSessions = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("activeSessions");
        if (!user) return res.status(404).json({ success: false, message: "User not found" });
        
        // Return sessions without the token for security
        const sessions = (user.activeSessions || []).map(s => ({
            _id: s._id,
            device: s.device,
            browser: s.browser,
            ip: s.ip,
            loginAt: s.loginAt,
            lastActive: s.lastActive,
            isCurrent: s.token === (req.cookies?.token || (req.headers.authorization?.startsWith('Bearer') ? req.headers.authorization.split(' ')[1] : null))
        }));
        
        res.json({ success: true, message: "Active sessions retrieved", data: sessions });
    } catch (error) {
        logger.error("Get sessions error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Get Audit Logs ───────────────────────────────────────────────────────────
exports.getAuditLogs = async (req, res) => {
    try {
        const AuditLog = require("../models/AuditLog");
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const [logs, total] = await Promise.all([
            AuditLog.find({ user: req.user._id })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments({ user: req.user._id })
        ]);

        res.json({
            success: true,
            message: "Audit logs retrieved",
            data: {
                logs,
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        logger.error("Get audit logs error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

// ─── Get Profile ──────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select("-password -activeSessions -emailVerificationToken -emailVerificationExpires -passwordResetToken -passwordResetExpires");
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

        const updatedUser = await User.findByIdAndUpdate(userId, updateData, { new: true, runValidators: true }).select("-password -activeSessions");

        if (!updatedUser) {
            return res.status(404).json({ success: false, message: "User not found." });
        }

        // Audit log
        createAuditLog(userId, "PROFILE_UPDATE", req, `Updated fields: ${Object.keys(updateData).join(", ")}`);

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
