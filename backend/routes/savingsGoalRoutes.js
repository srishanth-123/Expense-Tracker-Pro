const express = require("express");
const router = express.Router();
const authMiddleware = require("../middleware/authMiddleware");
const {
    getSavingsGoals,
    createSavingsGoal,
    updateSavingsGoal,
    deleteSavingsGoal,
    contributeToGoal,
    withdrawFromGoal
} = require("../controllers/savingsGoalController");

router.get("/", authMiddleware, getSavingsGoals);
router.post("/", authMiddleware, createSavingsGoal);
router.put("/:id", authMiddleware, updateSavingsGoal);
router.delete("/:id", authMiddleware, deleteSavingsGoal);
router.post("/:id/contribute", authMiddleware, contributeToGoal);
router.post("/:id/withdraw", authMiddleware, withdrawFromGoal);

module.exports = router;
