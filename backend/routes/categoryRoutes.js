const express=require("express");
const router=express.Router();
const protect=require("../middleware/authMiddleware");

const{
    createCategory,
    getCategories,
    deleteCategory,
    restoreCategory,
    updateCategory
}=require("../controllers/categoryController");

router.post("/",protect,createCategory);
router.get("/",protect,getCategories);
router.put("/:id",protect,updateCategory);
router.delete("/:id",protect,deleteCategory);
router.post("/:id/restore",protect,restoreCategory);

module.exports=router;

