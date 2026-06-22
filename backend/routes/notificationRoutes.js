const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");

const {
    getNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    deleteBulkNotifications,
    deleteAllNotifications
} = require("../controllers/notificationController");

// Protect all notification routes
router.use(authMiddleware);

router.get("/", getNotifications);
router.patch("/read-all", markAllAsRead);
router.patch("/:id/read", markAsRead);

router.delete("/all", deleteAllNotifications);
router.delete("/bulk", deleteBulkNotifications);
router.delete("/:id", deleteNotification);

module.exports = router;
