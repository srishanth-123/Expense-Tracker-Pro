const express=require("express");
const router=express.Router();
const protect=require("../middleware/authMiddleware");

const{
    allTimeSummary,
    categoryBreakdown,
    searchTransactions,
    monthlyReport,
    topExpenses,
    categoryTrend,
    smartInsights,
    dailyHeatmap,
    spendingPrediction,
    aiInsights
}=require("../controllers/analyticsController");

router.get("/summary",protect,allTimeSummary);
router.get("/category",protect,categoryBreakdown);
router.get("/search",protect,searchTransactions);
router.get("/report",protect,monthlyReport);

router.get("/top-expenses",protect,topExpenses);
router.get("/category-trend",protect,categoryTrend);
router.get("/insights",protect,smartInsights);
router.get("/heatmap",protect,dailyHeatmap);
router.get("/prediction",protect,spendingPrediction);
router.get("/ai-insights",protect,aiInsights);

module.exports=router;
