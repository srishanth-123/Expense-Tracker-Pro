const express=require("express");
const router=express.Router();
const protect=require("../middleware/authMiddleware");

const{
    monthlySummary,
    categoryBreakdown,
    searchTransactions,
    monthlyReport,
    topExpenses,
    categoryTrend,
    smartInsights,
    dailyHeatmap,
    spendingPrediction
}=require("../controllers/analyticsController");

router.get("/summary",protect,monthlySummary);
router.get("/category",protect,categoryBreakdown);
router.get("/search",protect,searchTransactions);
router.get("/report",protect,monthlyReport);

router.get("/top-expenses",protect,topExpenses);
router.get("/category-trend",protect,categoryTrend);
router.get("/insights",protect,smartInsights);
router.get("/heatmap",protect,dailyHeatmap);
router.get("/prediction",protect,spendingPrediction);

module.exports=router;
