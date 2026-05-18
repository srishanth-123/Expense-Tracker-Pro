const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
    // Handle payload-too-large error
    if (err.type === 'entity.too.large' || err.status === 413) {
        return res.status(413).json({ success: false, message: 'Payload too large. Maximum allowed size is 10kb.' });
    }

    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

    // Log server errors through Winston
    if (statusCode >= 500) {
        logger.error(`${req.method} ${req.originalUrl} - ${err.message}`, { stack: err.stack });
    }

    res.status(statusCode).json({
        success: false,
        message: err.message,
        stack: process.env.NODE_ENV === 'production' ? null : err.stack
    });
};

module.exports = errorHandler;

