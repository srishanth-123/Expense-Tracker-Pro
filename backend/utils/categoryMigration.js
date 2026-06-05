const Category = require("../models/category");
const Transaction = require("../models/Transaction");
const Budget = require("../models/budget");
const { normalizeCategoryName } = require("./categoryNormalizer");

async function migrateCategoryCaseSensitivity() {
    console.log("🚀 Starting Category Case Sensitivity Migration...");
    try {
        const users = await Category.distinct("user");
        let totalMerged = 0;
        let totalNormalized = 0;

        for (const userId of users) {
            const categories = await Category.find({ user: userId });
            const groups = {}; // normalizedName -> array of category docs
            
            for (const cat of categories) {
                const norm = normalizeCategoryName(cat.name);
                if (!groups[norm]) {
                    groups[norm] = [];
                }
                groups[norm].push(cat);
            }
            
            for (const [normName, docs] of Object.entries(groups)) {
                // Determine primary category
                // Prefer the one that is not deleted
                let primary = docs.find(d => !d.isDeleted);
                if (!primary) primary = docs[0];
                
                // Update primary name to normalized title case if needed
                if (primary.name !== normName) {
                    primary.name = normName;
                    await primary.save();
                    totalNormalized++;
                }
                
                // For all other duplicates, re-point transactions and budgets, then delete
                const duplicates = docs.filter(d => d._id.toString() !== primary._id.toString());
                for (const dup of duplicates) {
                    // Update transactions
                    const txResult = await Transaction.updateMany(
                        { category: dup._id },
                        { $set: { category: primary._id } }
                    );
                    
                    // Update budgets
                    const budgetResult = await Budget.updateMany(
                        { category: dup._id },
                        { $set: { category: primary._id } }
                    );
                    
                    console.log(`[Migration] Merged duplicate category "${dup.name}" (ID: ${dup._id}) into "${primary.name}" (ID: ${primary._id}). Updated ${txResult.modifiedCount} txs, ${budgetResult.modifiedCount} budgets.`);
                    
                    // Permanently delete duplicate
                    await Category.deleteOne({ _id: dup._id });
                    totalMerged++;
                }
            }
        }
        console.log(`✅ Category Case Sensitivity Migration completed. Normalized ${totalNormalized} categories, Merged ${totalMerged} duplicates.`);
    } catch (error) {
        console.error("❌ Error during Category Case Sensitivity Migration:", error);
    }
}

module.exports = { migrateCategoryCaseSensitivity };
