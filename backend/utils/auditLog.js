const AuditLog = require("../models/AuditLog");
const logger = require("./logger");

/**
 * Create an audit log entry for security-sensitive actions.
 * Fire-and-forget to avoid blocking the request.
 */
const createAuditLog = (userId, action, req, details = "", metadata = {}) => {
    setImmediate(async () => {
        try {
            const ip = req?.ip || req?.connection?.remoteAddress || "Unknown";
            const userAgent = req?.headers?.["user-agent"] || "Unknown";
            
            await AuditLog.create({
                user: userId,
                action,
                details,
                ip,
                userAgent,
                metadata
            });
        } catch (err) {
            logger.error(`[AUDIT] Failed to create audit log: ${err.message}`);
        }
    });
};

/**
 * Parse a user-agent string into a readable device/browser summary.
 */
const parseUserAgent = (ua) => {
    if (!ua || ua === "Unknown") return { device: "Unknown", browser: "Unknown" };
    
    let browser = "Unknown";
    let device = "Unknown";

    // Detect browser
    if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    else if (ua.includes("Edg")) browser = "Edge";
    else if (ua.includes("Opera") || ua.includes("OPR")) browser = "Opera";
    else browser = "Other";

    // Detect device/OS
    if (ua.includes("Windows")) device = "Windows PC";
    else if (ua.includes("Macintosh")) device = "Mac";
    else if (ua.includes("iPhone")) device = "iPhone";
    else if (ua.includes("iPad")) device = "iPad";
    else if (ua.includes("Android")) device = "Android";
    else if (ua.includes("Linux")) device = "Linux";
    else device = "Other";

    return { device, browser };
};

module.exports = { createAuditLog, parseUserAgent };
