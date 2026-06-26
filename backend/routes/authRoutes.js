const express = require("express");
const router = express.Router();
const { authLimiter } = require("../middleware/rateLimitMiddleware");
const { validateRegistration, validateLogin } = require("../middleware/validationMiddleware");

const {
    registerUser,
    loginUser,
    forgotPassword,
    resetPassword,
    changePassword,
    verifyEmail,
    resendVerificationEmail,
    logoutUser,
    logoutAllDevices,
    revokeSession,
    getActiveSessions,
    getAuditLogs,
    getMe,
    searchUsers,
    updateProfile
} = require("../controllers/authController");

const authMiddleware = require("../middleware/authMiddleware");

// ─── Public Routes ────────────────────────────────────────────────────────────
router.post("/register", authLimiter, validateRegistration, registerUser);
router.post("/login", authLimiter, validateLogin, loginUser);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password/:token", authLimiter, resetPassword);
router.get("/verify-email/:token", verifyEmail);

// ─── Protected Routes ─────────────────────────────────────────────────────────
router.post("/logout", authMiddleware, logoutUser);
router.post("/logout-all", authMiddleware, logoutAllDevices);
router.post("/resend-verification", authMiddleware, resendVerificationEmail);
router.put("/change-password", authMiddleware, changePassword);
router.get("/me", authMiddleware, getMe);
router.get("/users", authMiddleware, searchUsers);
router.put("/profile", authMiddleware, updateProfile);
router.get("/sessions", authMiddleware, getActiveSessions);
router.delete("/sessions/:sessionId", authMiddleware, revokeSession);
router.get("/audit-logs", authMiddleware, getAuditLogs);

module.exports = router;
