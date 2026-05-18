const express=require("express");
const router=express.Router();
const protect=require("../middleware/authMiddleware");

const{
    setBudget,
    getBudgets,
    checkBudget,
    deleteBudget,
    restoreBudget
}=require("../controllers/budgetController");

router.post("/",protect,setBudget);
router.get("/",protect,getBudgets);
router.get("/check",protect,checkBudget);
router.delete("/:id",protect,deleteBudget);
router.post("/:id/restore",protect,restoreBudget);

module.exports=router;

