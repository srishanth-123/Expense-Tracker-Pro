const { createLogger, transports, format } = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

// Require asyncLocalStorage lazily to avoid circular dependencies
const getRequestId = () => {
    try {
        const { asyncLocalStorage } = require('../middleware/requestId');
        const store = asyncLocalStorage.getStore();
        return store ? store.requestId : undefined;
    } catch (_) {
        return undefined;
    }
};

const requestTracingFormat = format((info) => {
    const requestId = getRequestId();
    if (requestId) {
        info.requestId = requestId;
    }
    return info;
});

const logger = createLogger({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    format: format.combine(
        requestTracingFormat(),
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
        format.errors({ stack: true }),
        format.json()
    ),
    transports: [
        // Always write errors to a file
        new transports.File({
            filename: path.join(logsDir, 'error.log'),
            level: 'error',
            maxsize: 5 * 1024 * 1024,   // 5MB max per file
            maxFiles: 5                  // Keep 5 rotated files
        }),
        // Write all logs to combined.log
        new transports.File({
            filename: path.join(logsDir, 'combined.log'),
            maxsize: 5 * 1024 * 1024,
            maxFiles: 5
        })
    ]
});

// Enable Console logging in all environments for Docker log compatibility
if (process.env.NODE_ENV === 'production') {
    // Structured JSON logging for production stdout/stderr
    logger.add(new transports.Console({
        format: format.combine(
            requestTracingFormat(),
            format.timestamp(),
            format.errors({ stack: true }),
            format.json()
        )
    }));
} else {
    // Beautiful colorized format for local development console
    logger.add(new transports.Console({
        format: format.combine(
            requestTracingFormat(),
            format.colorize(),
            format.printf(({ level, message, timestamp, stack, requestId }) => {
                const reqPrefix = requestId ? ` [ReqID: ${requestId}]` : '';
                return stack
                    ? `${timestamp} [${level}]${reqPrefix}: ${message}\n${stack}`
                    : `${timestamp} [${level}]${reqPrefix}: ${message}`;
            })
        )
    }));
}

module.exports = logger;
