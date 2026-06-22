const Category=require("../models/category");
const redis = require("../config/redis");
const { invalidateUserSearchCache } = require("../utils/lruCache");
const { normalizeCategoryName } = require("../utils/categoryNormalizer");
const { markFinancialDataChanged } = require("../utils/cacheHelpers");

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

exports.createCategory=async(req,res)=>{
    try {
        const {name}=req.body;
        if (!name || typeof name !== "string" || !name.trim()) {
            return res.status(400).json({success: false, message: "Category name is required"});
        }
        
        const normalizedName = normalizeCategoryName(name);

        // Check if exists
        let existingCategory = await Category.findOne({
            user: req.user._id,
            name: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, "i") }
        });

        if (existingCategory) {
            if (existingCategory.isDeleted) {
                // Restore deleted category
                existingCategory.isDeleted = false;
                existingCategory.deletedAt = null;
                existingCategory.name = normalizedName;
                await existingCategory.save();

                invalidateUserSearchCache(req.user._id);
                await markFinancialDataChanged(req.user._id);

                if (redis) {
                    try {
                        await redis.del(`categories:${req.user._id}`);
                        const searchKeys = await redis.keys(`search:${req.user._id}:*`);
                        if (searchKeys.length > 0) await redis.del(...searchKeys);
                    } catch (err) {
                        console.warn("Redis invalidation error:", err.message);
                    }
                }
                return res.json({success: true, message: "Category created", data: existingCategory});
            } else {
                return res.status(400).json({success: false, message: "Category already exists"});
            }
        }

        const category=await Category.create({
            name: normalizedName,
            user:req.user._id
        });

        invalidateUserSearchCache(req.user._id);
        await markFinancialDataChanged(req.user._id);

        if (redis) {
            try {
                await redis.del(`categories:${req.user._id}`);
                const searchKeys = await redis.keys(`search:${req.user._id}:*`);
                if (searchKeys.length > 0) await redis.del(...searchKeys);
            } catch (err) {
                console.warn("Redis invalidation error:", err.message);
            }
        }

        res.json({success: true, message: "Category created", data: category});
    } catch (error) {
        console.error("Create category error:", error);
        res.status(500).json({success: false, message: "Server error"});
    }
};

exports.getCategories = async (req, res) => {
    try {
        const cacheKey = `categories:${req.user._id}`;
        if (redis) {
            try {
                const cached = await redis.get(cacheKey);
                if (cached) {
                    let data;
                    if (typeof cached === "string") {
                        data = JSON.parse(cached);
                    } else if (typeof cached === "object") {
                        data = cached;
                    } else {
                        console.warn("Redis cache invalid type:", typeof cached);
                        await redis.del(cacheKey);
                    }
                    if (data) return res.json({success: true, message: "Success", data: data});
                }
            } catch (err) {
                console.warn("Redis GET error:", err.message);
                try {
                    await redis.del(cacheKey);
                } catch (delErr) {
                    console.warn("Failed to clear cache:", delErr.message);
                }
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

    invalidateUserSearchCache(req.user.id);
    await markFinancialDataChanged(req.user.id);

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

    invalidateUserSearchCache(req.user.id);
    await markFinancialDataChanged(req.user.id);

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

exports.updateCategory = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ success: false, message: "Category name is required" });
    }

    const normalizedName = normalizeCategoryName(name);

    // Check if another category with this name already exists
    const duplicateCategory = await Category.findOne({
      user: req.user._id,
      _id: { $ne: req.params.id },
      name: { $regex: new RegExp(`^${escapeRegex(normalizedName)}$`, "i") },
      isDeleted: false
    });

    if (duplicateCategory) {
      return res.status(400).json({ success: false, message: "Another category with this name already exists" });
    }

    const category = await Category.findOne({ _id: req.params.id, user: req.user._id, isDeleted: false });
    if (!category) {
      return res.status(404).json({ success: false, message: "Category not found" });
    }

    const oldName = category.name;
    category.name = normalizedName;
    await category.save();

    invalidateUserSearchCache(req.user._id);
    await markFinancialDataChanged(req.user._id);

    if (redis) {
      try {
        await redis.del(`categories:${req.user._id}`);
        const searchKeys = await redis.keys(`search:${req.user._id}:*`);
        if (searchKeys.length > 0) await redis.del(...searchKeys);
      } catch (err) {
        console.warn("Redis invalidation error:", err.message);
      }
    }

    res.json({ success: true, message: "Category updated successfully", data: category });
  } catch (error) {
    console.error("Update category error:", error);
    res.status(500).json({ success: false, message: "Server error" });
  }
};