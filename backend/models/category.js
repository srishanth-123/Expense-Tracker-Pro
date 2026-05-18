const mongoose=require("mongoose");

const categorySchema=new mongoose.Schema({
    name:String,
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
}, { timestamps: true });
// Add compound index for performance optimization
categorySchema.index({ user: 1, name: 1 });

module.exports=mongoose.model("Category",categorySchema);
