const Notification = require("../models/notificationModel");
const logger = require("../utils/logger");
const { getNotificationVersion, versionedCacheGet, markNotificationChanged } = require("../utils/cacheHelpers");

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
        const nv = await getNotificationVersion(userId);

        const { data } = await versionedCacheGet(cacheKey, nv, async () => {
            // Run queries in parallel
            const [notifications, total, unreadCount] = await Promise.all([
                Notification.find({ user: userId })
                    .sort({ createdAt: -1 })
                    .skip(skip)
                    .limit(limit),
                Notification.countDocuments({ user: userId }),
                Notification.countDocuments({ user: userId, read: false })
            ]);

            return {
                notifications,
                total,
                unreadCount,
                pages: Math.ceil(total / limit),
                currentPage: page
            };
        }, 300); // Cache for 5 mins

        res.json({
            success: true,
            ...data
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

        // Cache is auto-invalidated by findOneAndUpdate post-hook in notificationModel

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

        // Cache is auto-invalidated by updateMany post-hook in notificationModel

        res.json({ success: true, message: "All notifications marked as read" });
    } catch (error) {
        logger.error(`Error marking all notifications as read: ${error.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @desc    Delete a single notification
// @route   DELETE /api/v1/notifications/:id
// @access  Private
const deleteNotification = async (req, res) => {
    try {
        const notification = await Notification.findOneAndDelete({
            _id: req.params.id,
            user: req.user._id
        });

        if (!notification) {
            return res.status(404).json({ success: false, message: "Notification not found" });
        }

        // Trigger cache invalidation explicitly
        await markNotificationChanged(req.user._id);

        res.json({ success: true, message: "Notification deleted" });
    } catch (error) {
        logger.error(`Error deleting notification: ${error.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @desc    Delete multiple notifications
// @route   DELETE /api/v1/notifications/bulk
// @access  Private
const deleteBulkNotifications = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ success: false, message: "Please provide an array of notification IDs" });
        }

        await Notification.deleteMany({
            _id: { $in: ids },
            user: req.user._id
        });

        // Trigger cache invalidation explicitly
        await markNotificationChanged(req.user._id);

        res.json({ success: true, message: "Notifications deleted" });
    } catch (error) {
        logger.error(`Error deleting bulk notifications: ${error.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

// @desc    Delete all notifications for user
// @route   DELETE /api/v1/notifications/all
// @access  Private
const deleteAllNotifications = async (req, res) => {
    try {
        await Notification.deleteMany({ user: req.user._id });

        // Trigger cache invalidation explicitly
        await markNotificationChanged(req.user._id);

        res.json({ success: true, message: "All notifications deleted" });
    } catch (error) {
        logger.error(`Error deleting all notifications: ${error.message}`);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};

module.exports = {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteBulkNotifications,
    deleteAllNotifications
};
