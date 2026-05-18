const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const { validateTransaction, validateTransactionUpdate } = require("../middleware/transactionValidation");

const {
    addTransaction,
    getTransactions,
    updateTransaction,
    deleteTransaction,
    getTransactionById,
    restoreTransaction
} = require("../controllers/transactionController");

router.post("/", protect, validateTransaction, addTransaction);
router.get("/", protect, getTransactions);
router.get("/:id", protect, getTransactionById);
router.put("/:id", protect, validateTransactionUpdate, updateTransaction);
router.delete("/:id", protect, deleteTransaction);
router.post("/:id/restore", protect, restoreTransaction);

module.exports = router;

