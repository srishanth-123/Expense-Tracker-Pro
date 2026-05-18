const { createLogger, transports, format } = require('winston');
const path = require('path');
const fs = require('fs');

// Ensure logs directory exists
const logsDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
}

const logger = createLogger({
    level: process.env.NODE_ENV === 'production' ? 'warn' : 'info',
    format: format.combine(
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

// In development, also print readable logs to console
if (process.env.NODE_ENV !== 'production') {
    logger.add(new transports.Console({
        format: format.combine(
            format.colorize(),
            format.printf(({ level, message, timestamp, stack }) => {
                return stack
                    ? `${timestamp} [${level}]: ${message}\n${stack}`
                    : `${timestamp} [${level}]: ${message}`;
            })
        )
    }));
}

module.exports = logger;
