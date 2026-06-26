const express=require("express");
const router=express.Router();
const protect=require("../middleware/authMiddleware");
const requirePro = require("../middleware/proMiddleware");

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
    aiInsights,
    incomeExpenseTrend,
    getFinancialHealthScore,
    spendingForecast
}=require("../controllers/analyticsController");

router.get("/income-expense-trend",protect,incomeExpenseTrend);
router.get("/summary",protect,allTimeSummary);
router.get("/category",protect,categoryBreakdown);
router.get("/search",protect,searchTransactions);
router.get("/report",protect,monthlyReport);

router.get("/top-expenses",protect,requirePro,topExpenses);
router.get("/category-trend",protect,requirePro,categoryTrend);
router.get("/insights",protect,requirePro,smartInsights);
router.get("/heatmap",protect,requirePro,dailyHeatmap);
router.get("/prediction",protect,requirePro,spendingPrediction);
router.get("/ai-insights",protect,requirePro,aiInsights);
router.get("/financial-health",protect,requirePro,getFinancialHealthScore);
router.get("/forecast",protect,requirePro,spendingForecast);

module.exports=router;
