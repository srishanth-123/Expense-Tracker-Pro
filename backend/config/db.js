const mongoose = require("mongoose");
const logger = require("../utils/logger");

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGO_URI, {
            // ─── Connection Pool Tuning ──────────────────────────────────
            maxPoolSize: 20,                  // Up to 20 concurrent connections per node
            minPoolSize: 5,                   // Keep 5 warm connections ready
            serverSelectionTimeoutMS: 5000,   // Fail fast if DB unreachable (5s)
            socketTimeoutMS: 45000,           // Close stale sockets after 45s
        });
        logger.info("MongoDB connected (pool: 5-20)");

        // ─── Legacy Pro Migration ──────────────────────────────────
        try {
            const User = require("../models/user");
            const farFuture = new Date();
            farFuture.setFullYear(farFuture.getFullYear() + 10);
            
            const result = await User.updateMany(
                { isPro: true, $or: [{ plan: { $ne: "PRO" } }, { subscriptionStatus: { $ne: "ACTIVE" } }] },
                { 
                    $set: { 
                        plan: "PRO", 
                        subscriptionStatus: "ACTIVE",
                        subscriptionStartDate: new Date(),
                        subscriptionEndDate: farFuture 
                    } 
                }
            );
            if (result.modifiedCount > 0) {
                logger.info(`Migrated ${result.modifiedCount} legacy Pro users to the new subscription schema.`);
            }
        } catch (migError) {
            logger.error("Error migrating legacy Pro users:", migError.message);
        }
    } catch (error) {
        logger.error("MongoDB connection failed:", error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
