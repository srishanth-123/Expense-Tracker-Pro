const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const requirePro = require("../middleware/proMiddleware");
const { scanReceipt } = require("../controllers/ocrController");

router.post("/scan", protect, requirePro, scanReceipt);

module.exports = router;
