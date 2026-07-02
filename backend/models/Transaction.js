const mongoose=require("mongoose");

const transactionSchema=new mongoose.Schema({
    user:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"User"
    },
    
    amount:Number,
    type:{
        type:String,
        enum:["income","expense"]
    },
    category:{
        type:mongoose.Schema.Types.ObjectId,
        ref:"Category"
    },
    description:String,
    date:Date,
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
},
{timestamps:true}

);
// ─── Indexes ──────────────────────────────────────────────────────────────────
// Compound index covering the most common dashboard query:
//   { user: userId, isDeleted: false } + sort by date DESC
// Used by both find() and countDocuments() in getTransactions.
transactionSchema.index({ user: 1, isDeleted: 1, date: -1 });
transactionSchema.index({ user: 1, date: -1 });       // keep for backward compat
transactionSchema.index({ category: 1 });
transactionSchema.index({ type: 1 });
transactionSchema.index({ description: 'text' });

module.exports=mongoose.model("Transaction",transactionSchema);