const Budget=require("../models/budget");
const category = require("../models/category");
const Transaction=require("../models/Transaction");
const redis = require("../config/redis");

exports.setBudget=async(req,res)=>{
    const{category,limit,month,year}=req.body;

    const budget=await Budget.create({
        user:req.user._id,
        category,
        limit,
        month,
        year
    });

    if (redis) {
        try {
            await redis.del(`budgets:${req.user._id}`);
            const keys = await redis.keys(`checkBudgets:${req.user._id}:*`);
            if (keys.length > 0) {
                await redis.del(...keys);
            }
        } catch (err) {
            console.warn("Redis invalidation error:", err.message);
        }
    }

    res.json({success: true, message: "Success", data: budget});
};

exports.getBudgets = async (req, res) => {
    try {
        const cacheKey = `budgets:${req.user._id}`;
        if (redis) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) return res.json({success: true, message: "Success", data: typeof cached === "string" ? JSON.parse(cached) : cached});
            } catch (err) {
                console.warn("Redis GET error:", err.message);
            }
        }

        const budgets = await Budget.find({
            user: req.user._id,
            isDeleted: false
        }).populate("category");
        
        if (redis) {
            try {
                await redis.set(cacheKey, budgets, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: budgets});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.checkBudget=async(req,res)=>{
    const{month,year}=req.query;
    const cacheKey = `checkBudgets:${req.user._id}:${month}-${year}`;

    try {
        if (redis) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) return res.json({success: true, message: "Success", data: typeof cached === "string" ? JSON.parse(cached) : cached});
            } catch (err) {
                console.warn("Redis GET error:", err.message);
            }
        }

        const budgets=await Budget.find({
            user:req.user._id,
            month,
            year,
            isDeleted: false
        });

        const results=[];

        for(let budget of budgets){
        const spent=await Transaction.aggregate([
            {
                $match:{
                    user:req.user._id,
                    category:budget.category,
                    type:"expense",
                    date:{
                        $gte:new Date(year,month-1,1),
                        $lte:new Date(year,month,0)
                    },
                    isDeleted: false
                }
            },
            {
                $group:{
                    _id:null,
                    total:{$sum:"$amount"}
                }
            }
        ]);

        const totalSpent=spent[0]?.total || 0;
        results.push({
            category:budget.category,
            limit:budget.limit,
            spent:totalSpent,
            exceeded:totalSpent>budget.limit
        });
    }

        if (redis) {
            try {
                await redis.set(cacheKey, results, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: results});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.deleteBudget = async (req, res) => {
    try {
        const budget = await Budget.findOneAndUpdate(
            { _id: req.params.id, user: req.user._id },
            { isDeleted: true, deletedAt: new Date() }
        );

        if (!budget) {
            return res.status(404).json({success: false, message: "Resource not found"});
        }

        if (redis) {
            try {
                await redis.del(`budgets:${req.user._id}`);
                const keys = await redis.keys(`checkBudgets:${req.user._id}:*`);
                if (keys.length > 0) {
                    await redis.del(...keys);
                }
            } catch (err) {
                console.warn("Redis invalidation error:", err.message);
            }
        }

        res.json({success: true, message: "Budget deleted successfully" });
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.restoreBudget = async (req, res) => {
    try {
        const budget = await Budget.findOne({ _id: req.params.id, user: req.user._id });
        
        if (!budget) {
            return res.status(404).json({success: false, message: "Resource not found"});
        }

        if (!budget.isDeleted) {
            return res.status(400).json({success: false, message: "Invalid request data"});
        }

        budget.isDeleted = false;
        budget.deletedAt = null;
        await budget.save();

        if (redis) {
            try {
                await redis.del(`budgets:${req.user._id}`);
                const keys = await redis.keys(`checkBudgets:${req.user._id}:*`);
                if (keys.length > 0) {
                    await redis.del(...keys);
                }
            } catch (err) {
                console.warn("Redis invalidation error:", err.message);
            }
        }

        res.json({success: true, message: "Budget restored successfully" });
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};
