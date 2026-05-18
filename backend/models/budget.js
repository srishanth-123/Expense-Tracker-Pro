const mongoose=require("mongoose");
const category = require("./category");

const budgetSchema=new mongoose.Schema({
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },
    category:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Category"
    },
    limit:Number,
    month:Number,
    year:Number,
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
});

module.exports=mongoose.model("Budget",budgetSchema);
