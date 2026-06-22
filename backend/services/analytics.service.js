const mongoose = require("mongoose");
const Transaction = require("../models/Transaction");
const Category = require("../models/category");
const Heap = require("../utils/heap");

exports.getTopExpenses = async (userId, limit = 5, startDate = null, endDate = null) => {
    // We want the TOP expenses, so we keep a MinHeap of size 'limit'.
    // A MinHeap with comparator (a, b) => a.amount - b.amount
    // means the smallest element is at the top.
    const minHeap = new Heap((a, b) => b.amount - a.amount); // Wait, if (a, b) => a - b > 0 means swap.
    // Let's ensure Heap logic:
    // Our heap sinks when comparator(child, parent) > 0.
    // If we want a MinHeap, we want the smallest element at the root.
    // So parent < child. If child < parent, we swap.
    // Thus comparator(child, parent) = parent.amount - child.amount.
    // Let's just do a simpler approach: fetch all and then use a MaxHeap to extract top K.
    // Or just a standard sort if it's not too huge, but the requirement specifically asks for "heap".

    const query = {
        user: userId,
        type: "expense",
        isDeleted: false
    };

    if (startDate || endDate) {
        query.date = {};
        if (startDate) query.date.$gte = startDate;
        if (endDate) query.date.$lte = endDate;
    }

    const expenses = await Transaction.find(query).read("secondaryPreferred").populate("category").lean();

    // MaxHeap where largest amount is at the root.
    // comparator(a, b) > 0 means a should be closer to root than b.
    // So a.amount > b.amount -> a - b > 0.
    const maxHeap = new Heap((a, b) => a.amount - b.amount);

    for (let expense of expenses) {
        maxHeap.push(expense);
    }

    const result = [];
    const actualLimit = Math.min(limit, maxHeap.size());
    for (let i = 0; i < actualLimit; i++) {
        const exp = maxHeap.pop();
        result.push({
            amount: exp.amount,
            description: exp.description,
            category: exp.category ? { name: exp.category.name } : null,
            date: exp.date
        });
    }

    return result;
};

exports.getCategoryTrend = async (userId) => {
    const objUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1); // Last 6 months including current

    const data = await Transaction.aggregate([
        {
            $match: {
                user: objUserId,
                type: "expense",
                isDeleted: false,
                date: { $gte: sixMonthsAgo }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: "$date" },
                    month: { $month: "$date" },
                    category: "$category"
                },
                total: { $sum: "$amount" }
            }
        },
        {
            $lookup: {
                from: "categories",
                localField: "_id.category",
                foreignField: "_id",
                as: "categoryDoc"
            }
        },
        { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } },
        {
            $sort: { "_id.year": 1, "_id.month": 1 }
        }
    ]).read("secondaryPreferred");

    // Format into chart-ready data
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    // Generate all month labels for the last 6 months
    const labels = [];
    const datasetsMap = new Map(); // key: category name, value: map of label -> total

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        labels.push(label);
    }

    data.forEach(item => {
        const label = `${monthNames[item._id.month - 1]} ${item._id.year}`;
        const catName = item.categoryDoc ? item.categoryDoc.name : "Uncategorized";
        if (!datasetsMap.has(catName)) {
            datasetsMap.set(catName, new Map());
        }
        datasetsMap.get(catName).set(label, item.total);
    });

    const datasets = [];

    for (let [catName, labelMap] of datasetsMap.entries()) {
        const dataArr = labels.map(label => labelMap.get(label) || 0);
        datasets.push({
            label: catName,
            data: dataArr
        });
    }

    return { labels, datasets };
};

exports.getSmartInsights = async (userId) => {
    const objUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // JS dates roll over automatically: month - 1 of Jan is Dec of prev year
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const currentDay = now.getDate();
    const prevMonthEndFull = new Date(now.getFullYear(), now.getMonth(), 0);
    // Limit to same day of the month for last month (MTD - Month to Date comparison)
    const prevMonthMTDEnd = new Date(now.getFullYear(), now.getMonth() - 1, Math.min(currentDay, prevMonthEndFull.getDate()), 23, 59, 59, 999);

    // Check if user has any transactions at all
    const hasAnyTransactions = await Transaction.findOne({
        user: objUserId,
        type: "expense",
        isDeleted: false
    }).read("secondaryPreferred");

    if (!hasAnyTransactions) {
        return { insights: ["Start tracking your expenses to get personalized insights!"], currentTotal: 0, prevTotal: 0 };
    }

    const currentData = await Transaction.aggregate([
        { 
            $match: { 
                user: objUserId, 
                type: "expense", 
                isDeleted: false, 
                date: { $gte: currentMonthStart } 
            } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).read("secondaryPreferred");

    const prevData = await Transaction.aggregate([
        { 
            $match: { 
                user: objUserId, 
                type: "expense", 
                isDeleted: false, 
                date: { $gte: prevMonthStart, $lte: prevMonthMTDEnd } 
            } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]).read("secondaryPreferred");

    const currentTotal = currentData.length > 0 ? currentData[0].total : 0;
    const prevTotal = prevData.length > 0 ? prevData[0].total : 0;

    let insight;

    if (currentTotal === 0 && prevTotal === 0) {
        insight = "Add some expenses this month to see spending comparisons.";
    } else if (prevTotal === 0 && currentTotal > 0) {
        insight = `You started tracking! You've spent ₹${currentTotal} so far this month.`;
    } else if (prevTotal > 0) {
        const diff = currentTotal - prevTotal;
        const percent = ((Math.abs(diff) / prevTotal) * 100).toFixed(1);
        
        if (diff > 0) {
            insight = `You spent ${percent}% more month-to-date compared to the same period last month (₹${currentTotal} vs ₹${prevTotal}).`;
        } else if (diff < 0) {
            insight = `Great job! You spent ${percent}% less month-to-date compared to the same period last month (₹${currentTotal} vs ₹${prevTotal}).`;
        } else {
            insight = `Your spending this month is exactly on pace with the same period last month (₹${currentTotal}).`;
        }
    }

    // 2. Add category-specific smart insight
    const categoryData = await Transaction.aggregate([
        {
            $match: {
                user: objUserId,
                type: "expense",
                isDeleted: false,
                date: { $gte: currentMonthStart }
            }
        },
        {
            $group: {
                _id: "$category",
                total: { $sum: "$amount" }
            }
        },
        { $sort: { total: -1 } },
        { $limit: 1 },
        {
            $lookup: {
                from: "categories",
                localField: "_id",
                foreignField: "_id",
                as: "categoryDoc"
            }
        },
        { $unwind: { path: "$categoryDoc", preserveNullAndEmptyArrays: true } }
    ]).read("secondaryPreferred");

    let topCategoryInsight = null;
    if (categoryData.length > 0 && categoryData[0].total > 0) {
        const topCatName = categoryData[0].categoryDoc ? categoryData[0].categoryDoc.name : "Uncategorized";
        const topCatAmount = categoryData[0].total;
        const topCatPercent = currentTotal > 0 ? ((topCatAmount / currentTotal) * 100).toFixed(0) : 0;
        topCategoryInsight = `Your top category this month is ${topCatName} at ₹${topCatAmount.toLocaleString('en-IN')} (${topCatPercent}% of total).`;
    }

    const insights = [insight];
    if (topCategoryInsight) {
        insights.push(topCategoryInsight);
    } else {
        insights.push("Tip: Categorize your transactions to see category-specific smart insights.");
    }

    return { insights, currentTotal, prevTotal };
};

exports.getDailyHeatmap = async (userId) => {
    const objUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const data = await Transaction.aggregate([
        {
            $match: {
                user: objUserId,
                type: "expense",
                isDeleted: false,
                date: { $gte: thirtyDaysAgo }
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                total: { $sum: "$amount" }
            }
        },
        { $sort: { "_id": 1 } }
    ]).read("secondaryPreferred");

    // Create a map of date -> total from the aggregation result
    const dataMap = new Map();
    data.forEach(item => {
        dataMap.set(item._id, item.total);
    });

    // Generate all 30 days labels
    const result = [];
    for (let i = 29; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0]; // YYYY-MM-DD format
        result.push({
            _id: dateStr,
            total: dataMap.get(dateStr) || 0
        });
    }

    return result;
};

exports.getSpendingPrediction = async (userId) => {
    const objUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const now = new Date();
    // To predict next month, take average of last 3 completed months
    const threeMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); 
    // Example: if now is May 15. prevMonthEnd = April 30. threeMonthsAgoStart = Feb 1. 
    // Completed months = Feb, Mar, Apr.

    const data = await Transaction.aggregate([
        { 
            $match: { 
                user: objUserId, 
                type: "expense", 
                isDeleted: false, 
                date: { $gte: threeMonthsAgoStart, $lte: lastMonthEnd } 
            } 
        },
        { 
            $group: { 
                _id: { month: { $month: "$date" }, year: { $year: "$date" } }, 
                total: { $sum: "$amount" } 
            } 
        }
    ]).read("secondaryPreferred");

    let predictedExpense = 0;
    if (data.length > 0) {
        const sum = data.reduce((acc, curr) => acc + curr.total, 0);
        predictedExpense = sum / data.length; // average
    } else {
        // Fallback: use current month's spending if no historical data
        const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const currentMonthData = await Transaction.aggregate([
            { 
                $match: { 
                    user: objUserId, 
                    type: "expense", 
                    isDeleted: false, 
                    date: { $gte: currentMonthStart, $lte: now } 
                } 
            },
            { 
                $group: { 
                    _id: null, 
                    total: { $sum: "$amount" } 
                } 
            }
        ]).read("secondaryPreferred");
        if (currentMonthData.length > 0) {
            predictedExpense = currentMonthData[0].total;
        }
    }

    return {
        predictedExpense: parseFloat(predictedExpense.toFixed(2))
    };
};

exports.getIncomeExpenseTrend = async (userId) => {
    const objUserId = typeof userId === 'string' ? new mongoose.Types.ObjectId(userId) : userId;
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const data = await Transaction.aggregate([
        {
            $match: {
                user: objUserId,
                isDeleted: false,
                date: { $gte: sixMonthsAgo }
            }
        },
        {
            $group: {
                _id: {
                    year: { $year: "$date" },
                    month: { $month: "$date" },
                    type: "$type"
                },
                total: { $sum: "$amount" }
            }
        },
        {
            $sort: { "_id.year": 1, "_id.month": 1 }
        }
    ]).read("secondaryPreferred");

    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const result = [];

    for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        result.push({
            name: label,
            income: 0,
            expense: 0,
            year: d.getFullYear(),
            month: d.getMonth() + 1
        });
    }

    data.forEach(item => {
        const matchingPoint = result.find(r => r.year === item._id.year && r.month === item._id.month);
        if (matchingPoint) {
            if (item._id.type === "income") {
                matchingPoint.income = item.total;
            } else if (item._id.type === "expense") {
                matchingPoint.expense = item.total;
            }
        }
    });

    return result;
};
