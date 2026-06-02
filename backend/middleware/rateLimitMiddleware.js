/**
 * Backwards-compatible shim — the actual implementation now lives in
 * `./rateLimiter.js` and is backed by distributed Upstash Redis storage.
 * All existing route imports continue to work unchanged.
 */
module.exports = require("./rateLimiter");
