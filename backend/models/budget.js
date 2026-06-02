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
    // `limit` is the budgeted amount. `amount` is exposed as an alias for API compatibility.
    limit:{ type: Number, alias: "amount" },
    month:Number,
    year:Number,
    // Tracking fields (incrementally maintained by budgetService)
    spentAmount: { type: Number, default: 0 },
    warningThreshold: { type: Number, default: 80 },
    exceeded: { type: Boolean, default: false },
    // Highest alert level already notified to avoid duplicate notifications: 0=none, 1=warning, 2=exceeded
    lastNotifiedLevel: { type: Number, default: 0 },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date, default: null }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Speed up the common lookup (user + category + month + year)
budgetSchema.index({ user: 1, category: 1, month: 1, year: 1 });

module.exports=mongoose.model("Budget",budgetSchema);
