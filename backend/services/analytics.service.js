const Transaction = require("../models/Transaction");
const Heap = require("../utils/heap");

exports.getTopExpenses = async (userId, limit = 5) => {
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
    
    const expenses = await Transaction.find({
        user: userId,
        type: "expense",
        isDeleted: false
    }).populate("category").lean();

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
            category: exp.category ? exp.category.name : "Uncategorized",
            date: exp.date
        });
    }

    return result;
};

exports.getCategoryTrend = async (userId) => {
    const data = await Transaction.aggregate([
        {
            $match: {
                user: userId,
                type: "expense",
                isDeleted: false
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
    ]);

    // Format into chart-ready data
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    
    const labelsSet = new Set();
    const datasetsMap = new Map(); // key: category name, value: map of label -> total

    data.forEach(item => {
        const label = `${monthNames[item._id.month - 1]} ${item._id.year}`;
        labelsSet.add(label);

        const catName = item.categoryDoc ? item.categoryDoc.name : "Uncategorized";
        if (!datasetsMap.has(catName)) {
            datasetsMap.set(catName, new Map());
        }
        datasetsMap.get(catName).set(label, item.total);
    });

    const labels = Array.from(labelsSet);
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
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    
    // JS dates roll over automatically: month - 1 of Jan is Dec of prev year
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); 
    // 0th day of current month is last day of previous month

    const currentData = await Transaction.aggregate([
        { 
            $match: { 
                user: userId, 
                type: "expense", 
                isDeleted: false, 
                date: { $gte: currentMonthStart } 
            } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const prevData = await Transaction.aggregate([
        { 
            $match: { 
                user: userId, 
                type: "expense", 
                isDeleted: false, 
                date: { $gte: prevMonthStart, $lte: prevMonthEnd } 
            } 
        },
        { $group: { _id: null, total: { $sum: "$amount" } } }
    ]);

    const currentTotal = currentData.length > 0 ? currentData[0].total : 0;
    const prevTotal = prevData.length > 0 ? prevData[0].total : 0;

    let insight = "Not enough data to generate insights for this month.";

    if (prevTotal === 0 && currentTotal > 0) {
        insight = `You started tracking! You've spent ₹${currentTotal} so far this month.`;
    } else if (prevTotal > 0) {
        const diff = currentTotal - prevTotal;
        const percent = ((Math.abs(diff) / prevTotal) * 100).toFixed(1);
        
        if (diff > 0) {
            insight = `You spent ${percent}% more this month compared to last month.`;
        } else if (diff < 0) {
            insight = `Great job! You spent ${percent}% less this month compared to last month.`;
        } else {
            insight = `Your spending this month is exactly the same as last month.`;
        }
    }

    return { insight, currentTotal, prevTotal };
};

exports.getDailyHeatmap = async (userId) => {
    const data = await Transaction.aggregate([
        {
            $match: {
                user: userId,
                type: "expense",
                isDeleted: false
            }
        },
        {
            $group: {
                _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                amount: { $sum: "$amount" }
            }
        },
        { $sort: { "_id": 1 } }
    ]);

    return data.map(item => ({
        date: item._id,
        amount: item.amount
    }));
};

exports.getSpendingPrediction = async (userId) => {
    const now = new Date();
    // To predict next month, take average of last 3 completed months
    const threeMonthsAgoStart = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0); 
    // Example: if now is May 15. prevMonthEnd = April 30. threeMonthsAgoStart = Feb 1. 
    // Completed months = Feb, Mar, Apr.

    const data = await Transaction.aggregate([
        { 
            $match: { 
                user: userId, 
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
    ]);

    let predictedExpense = 0;
    if (data.length > 0) {
        const sum = data.reduce((acc, curr) => acc + curr.total, 0);
        predictedExpense = sum / data.length; // average
    }

    return {
        predictedExpense: parseFloat(predictedExpense.toFixed(2))
    };
};
