const express = require("express");
const router = express.Router();
const protect = require("../middleware/authMiddleware");
const requirePro = require("../middleware/proMiddleware");
const { validateTransaction, validateTransactionUpdate } = require("../middleware/transactionValidation");

const {
    addTransaction,
    bulkAddTransactions,
    getTransactions,
    updateTransaction,
    deleteTransaction,
    getTransactionById,
    restoreTransaction,
    exportTransactionsPDF
} = require("../controllers/transactionController");

router.post("/", protect, validateTransaction, addTransaction);
router.post("/bulk", protect, bulkAddTransactions);
router.get("/export/pdf", protect, requirePro, exportTransactionsPDF);
router.get("/", protect, getTransactions);
router.get("/:id", protect, getTransactionById);
router.put("/:id", protect, validateTransactionUpdate, updateTransaction);
router.delete("/:id", protect, deleteTransaction);
router.post("/:id/restore", protect, restoreTransaction);

module.exports = router;

