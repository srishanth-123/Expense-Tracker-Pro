const { Redis } = require("@upstash/redis");
const dotenv = require("dotenv");
const logger = require("../utils/logger");

dotenv.config();

let redis = null;

if (process.env.REDIS_URL && process.env.REDIS_TOKEN) {
    try {
        redis = new Redis({
            url: process.env.REDIS_URL,
            token: process.env.REDIS_TOKEN,
        });
        logger.info("Upstash Redis initialized");
    } catch (error) {
        logger.error("Failed to initialize Upstash Redis:", error.message);
    }
} else {
    logger.warn("REDIS_URL or REDIS_TOKEN is missing. Application will fallback to DB without caching.");
}

module.exports = redis;
