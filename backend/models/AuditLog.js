const mongoose = require("mongoose");

const auditLogSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        action: {
            type: String,
            enum: [
                "LOGIN",
                "LOGIN_FAILED",
                "LOGOUT",
                "LOGOUT_ALL_DEVICES",
                "REGISTER",
                "PASSWORD_CHANGE",
                "PASSWORD_RESET_REQUEST",
                "PASSWORD_RESET_COMPLETE",
                "PROFILE_UPDATE",
                "EMAIL_VERIFIED",
                "PAYMENT_SUCCESS",
                "PAYMENT_FAILED",
                "PRO_UPGRADE",
                "WALLET_TOPUP",
                "WALLET_WITHDRAWAL",
                "SESSION_REVOKED",
                "RECEIPT_OCR_SCAN"
            ],
            required: true,
        },
        details: {
            type: String,
            default: "",
        },
        ip: {
            type: String,
            default: "Unknown",
        },
        userAgent: {
            type: String,
            default: "Unknown",
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {},
        }
    },
    { timestamps: true }
);

// Index for efficient user-scoped queries sorted by recency
auditLogSchema.index({ user: 1, createdAt: -1 });

// Auto-cleanup: TTL index to delete audit logs older than 90 days
auditLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
