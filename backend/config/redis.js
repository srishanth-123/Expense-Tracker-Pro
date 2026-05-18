const { Redis } = require("@upstash/redis");
const dotenv = require("dotenv");

dotenv.config();

let redis = null;

if (process.env.REDIS_URL && process.env.REDIS_TOKEN) {
    try {
        redis = new Redis({
            url: process.env.REDIS_URL,
            token: process.env.REDIS_TOKEN,
        });
        console.log("Upstash Redis initialized");
    } catch (error) {
        console.error("Failed to initialize Upstash Redis:", error.message);
    }
} else {
    console.warn("REDIS_URL or REDIS_TOKEN is missing. Application will fallback to DB without caching.");
}

module.exports = redis;
