const Notification = require("../models/notificationModel");
const logger = require("../utils/logger");
const redis = require("../config/redis");

// @desc    Get user's notifications (paginated)
// @route   GET /api/v1/notifications
// @access  Private
const getNotifications = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const skip = (page - 1) * limit;
        const userId = req.user._id;

        const cacheKey = `notifications:${userId}:${page}:${limit}`;

        if (redis) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    return res.json({ success: true, ...JSON.parse(cached), fromCache: true });
                }
            } catch (err) {
                console.warn("Redis GET error:", err.message);
            }
        }

        // Run queries in parallel
        const [notifications, total, unreadCount] = await Promise.all([
            Notification.find({ user: userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            Notification.countDocuments({ user: userId }),
            Notification.countDocuments({ user: userId, read: false })
        ]);

        const result = {
            notifications,
            total,
            unreadCount,
            pages: Math.ceil(total / limit),
            currentPage: page
        };

        if (redis) {
            try {
                await redis.set(cacheKey, JSON.stringify(result), { ex: 300 }); // Cache for 5 mins
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({
            success: true,
            ...result
        });
    } catch (error) {
        logger.error(`Error fetching notifications: ${error.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @desc    Mark a notification as read
// @route   PATCH /api/v1/notifications/:id/read
// @access  Private
const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { read: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        // Clear cache for this user's notifications
        if (redis) {
            try {
                const userId = req.user._id;
                const keys = await redis.keys(`notifications:${userId}:*`);
                if (keys.length > 0) {
                    await redis.del(keys);
                }
            } catch (err) {
                console.warn("Failed to clear notification cache:", err.message);
            }
        }

        res.json({ success: true, notification });
    } catch (error) {
        logger.error(`Error marking notification as read: ${error.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @desc    Mark all notifications as read
// @route   PATCH /api/v1/notifications/read-all
// @access  Private
const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { user: req.user._id, read: false },
            { read: true }
        );

        // Clear cache for this user's notifications
        if (redis) {
            try {
                const userId = req.user._id;
                const keys = await redis.keys(`notifications:${userId}:*`);
                if (keys.length > 0) {
                    await redis.del(keys);
                }
            } catch (err) {
                console.warn("Failed to clear notification cache:", err.message);
            }
        }

        res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
        logger.error(`Error marking all notifications as read: ${error.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead
};
