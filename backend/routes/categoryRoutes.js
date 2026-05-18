const express=require("express");
const router=express.Router();
const protect=require("../middleware/authMiddleware");

const{
    createCategory,
    getCategories,
    deleteCategory,
    restoreCategory
}=require("../controllers/categoryController");

router.post("/",protect,createCategory);
router.get("/",protect,getCategories);
router.delete("/:id",protect,deleteCategory);
router.post("/:id/restore",protect,restoreCategory);

module.exports=router;

