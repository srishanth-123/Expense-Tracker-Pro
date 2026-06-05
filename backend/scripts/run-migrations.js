const dotenv = require("dotenv");
const connectDB = require("../config/db");
const mongoose = require("mongoose");
const categoryMigration = require("../utils/categoryMigration");
const logger = require("../utils/logger");

// Load env vars
dotenv.config();

const run = async () => {
    logger.info("🚀 Starting standalone migrations runner...");
    try {
        await connectDB();
        await categoryMigration.migrateCategoryCaseSensitivity();
        logger.info("✅ Migrations completed successfully!");
        await mongoose.disconnect();
        logger.info("💤 Disconnected from MongoDB.");
        process.exit(0);
    } catch (err) {
        logger.error("❌ Migration failed with error:", err);
        process.exit(1);
    }
};

run();
