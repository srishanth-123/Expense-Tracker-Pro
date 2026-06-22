const logger = require("./logger");

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry(operation, maxRetries = 3, baseDelay = 1000) {
    let attempt = 0;
    while (attempt < maxRetries) {
        try {
            return await operation(); // Execute exactly what is passed seamlessly
        } catch (error) {
            attempt++;
            
            logger.warn(`[Retry Mechanism] Attempt ${attempt} failed: ${error.message}`);
            
            if (attempt >= maxRetries) {
                logger.error(`[Retry Mechanism] Critical failure after ${maxRetries} max retries.`);
                throw error;
            }

            // Standard Exponential Backoff calculation
            const delayTime = baseDelay * Math.pow(2, attempt - 1);
            logger.info(`[Retry Mechanism] Backing off for ${delayTime}ms...`);
            await sleep(delayTime);
        }
    }
}

module.exports = { withRetry };
