const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
    getRecurringTransactions,
    createRecurringTransaction,
    updateRecurringTransaction,
    deleteRecurringTransaction
} = require("../controllers/recurringController");

router.get("/", authMiddleware, getRecurringTransactions);
router.post("/", authMiddleware, createRecurringTransaction);
router.put("/:id", authMiddleware, updateRecurringTransaction);
router.delete("/:id", authMiddleware, deleteRecurringTransaction);

module.exports = router;
