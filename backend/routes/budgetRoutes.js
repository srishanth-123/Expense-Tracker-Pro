const express=require("express");
const router=express.Router();
const protect=require("../middleware/authMiddleware");

const{
    setBudget,
    getBudgets,
    getBudgetById,
    updateBudget,
    getBudgetSummary,
    checkBudget,
    deleteBudget,
    restoreBudget
}=require("../controllers/budgetController");

router.post("/",protect,setBudget);
router.get("/",protect,getBudgets);
// Static paths MUST be declared before the dynamic "/:id" route.
router.get("/check",protect,checkBudget);
router.get("/summary",protect,getBudgetSummary);
router.get("/:id",protect,getBudgetById);
router.put("/:id",protect,updateBudget);
router.delete("/:id",protect,deleteBudget);
router.post("/:id/restore",protect,restoreBudget);

module.exports=router;

