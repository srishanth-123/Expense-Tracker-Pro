/**
 * Response Compression Middleware
 * --------------------------------
 * Applies gzip/deflate compression to all HTTP responses.
 * Reduces JSON payload sizes by ~60-80%, improving page load times
 * especially on slower mobile connections.
 *
 * Skips compression for responses already compressed or below 1KB
 * (where compression overhead exceeds the benefit).
 */

const compression = require("compression");

const compressionMiddleware = compression({
    // Only compress responses larger than 1KB
    threshold: 1024,
    // Compression level: 6 is a good balance between speed and ratio
    level: 6,
    // Don't compress responses with Cache-Control: no-transform
    filter: (req, res) => {
        if (req.headers["x-no-compression"]) {
            return false;
        }
        return compression.filter(req, res);
    },
});

module.exports = compressionMiddleware;
