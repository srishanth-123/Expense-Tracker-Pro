const Category=require("../models/category");
const searchRegistry = require("../utils/trie");
const redis = require("../config/redis");
const { invalidateUserSearchCache } = require("../utils/lruCache");

exports.createCategory=async(req,res)=>{
    const {name}=req.body;
    const category=await Category.create({
        name,
        user:req.user._id
    });

    searchRegistry.getTrie(req.user._id).insert(name, {
        id: category._id,
        text: name,
        type: 'category'
    });

    invalidateUserSearchCache(req.user._id);

    if (redis) {
        try {
            await redis.del(`categories:${req.user._id}`);
            const searchKeys = await redis.keys(`search:${req.user._id}:*`);
            if (searchKeys.length > 0) await redis.del(...searchKeys);
        } catch (err) {
            console.warn("Redis invalidation error:", err.message);
        }
    }

    res.json({success: true, message: "Success", data: category});
};

exports.getCategories = async (req, res) => {
    try {
        const cacheKey = `categories:${req.user._id}`;
        if (redis) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) return res.json({success: true, message: "Success", data: typeof cached === "string" ? JSON.parse(cached) : cached});
            } catch (err) {
                console.warn("Redis GET error:", err.message);
            }
        }

        const categories = await Category.find({
            user: req.user._id,
            isDeleted: false
        });

        if (redis) {
            try {
                await redis.set(cacheKey, categories, { ex: 300 });
            } catch (err) {
                console.warn("Redis SET error:", err.message);
            }
        }

        res.json({success: true, message: "Success", data: categories});
    } catch (error) {
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.deleteCategory = async (req, res) => {
  try {
    const category = await Category.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id },
      { isDeleted: true, deletedAt: new Date() }
    );

    if (!category) {
      return res.status(404).json({success: false, message: "Resource not found"});
    }

    searchRegistry.getTrie(req.user.id).remove(category.name, category._id);

    invalidateUserSearchCache(req.user.id);

    if (redis) {
        try {
            await redis.del(`categories:${req.user.id}`);
            const searchKeys = await redis.keys(`search:${req.user.id}:*`);
            if (searchKeys.length > 0) await redis.del(...searchKeys);
        } catch (err) {
            console.warn("Redis invalidation error:", err.message);
        }
    }

    res.json({success: true, message: "Category deleted successfully" });
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
};

exports.restoreCategory = async (req, res) => {
  try {
    const category = await Category.findOne({
      _id: req.params.id,
      user: req.user.id
    });

    if (!category) {
      return res.status(404).json({success: false, message: "Resource not found"});
    }

    if (!category.isDeleted) {
      return res.status(400).json({success: false, message: "Invalid request data"});
    }

    category.isDeleted = false;
    category.deletedAt = null;
    await category.save();

    searchRegistry.getTrie(req.user.id).insert(category.name, {
      id: category._id,
      text: category.name,
      type: 'category'
    });

    invalidateUserSearchCache(req.user.id);

    if (redis) {
        try {
            await redis.del(`categories:${req.user.id}`);
            const searchKeys = await redis.keys(`search:${req.user.id}:*`);
            if (searchKeys.length > 0) await redis.del(...searchKeys);
        } catch (err) {
            console.warn("Redis invalidation error:", err.message);
        }
    }

    res.json({success: true, message: "Category restored successfully" });
  } catch (error) {
    res.status(500).json({success: false, message: "Server error"});
  }
};