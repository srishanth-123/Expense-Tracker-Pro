const express = require("express");
const router = express.Router();
const { authLimiter } = require("../middleware/rateLimitMiddleware");
const { validateRegistration, validateLogin } = require("../middleware/validationMiddleware");

const {
    registerUser,
    loginUser,
    logoutUser,
    getMe,
    searchUsers
} = require("../controllers/authController");

const authMiddleware = require("../middleware/authMiddleware");

router.post("/register", authLimiter, validateRegistration, registerUser);
router.post("/login", authLimiter, validateLogin, loginUser);
router.post("/logout", logoutUser);
router.get("/me", authMiddleware, getMe);
router.get("/users", authMiddleware, searchUsers);

module.exports = router;

