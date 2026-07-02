const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoSanitize = require("express-mongo-sanitize");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const compressionMiddleware = require("./middleware/compression");
const { generalLimiter } = require("./middleware/rateLimitMiddleware");

const logger = require("./utils/logger");
const validateEnv = require("./config/envValidation");
const connectDB = require("./config/db");

validateEnv();

const app = express();

// ─── Request ID Tracing ──────────────────────────────────────────────────────
const { requestIdMiddleware } = require("./middleware/requestId");
app.use(requestIdMiddleware);

// ─── API Documentation (Swagger) ──────────────────────────────────────────────
const setupSwagger = require("./config/swagger");
setupSwagger(app);

// ─── Production Hardening ─────────────────────────────────────────────────────
app.set('trust proxy', 1); // Trust first proxy (Nginx, AWS ALB, Render, etc.)

// ─── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet());

// ─── Response Compression (gzip/deflate) ──────────────────────────────────────
app.use(compressionMiddleware);

// ─── CORS Configuration ────────────────────────────────────────────────────────
app.use(cors({
    origin: process.env.NODE_ENV === 'production'
        ? (process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',') : [])
        : (process.env.FRONTEND_URL
            ? [process.env.FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']
            : ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175']),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-idempotency-key']
}));

// Cookie parser (must come before routes)
app.use(cookieParser());

// ─── Request Logging (Morgan → Winston) ───────────────────────────────────────
app.use(morgan("combined", {
    stream: { write: (message) => logger.info(message.trim()) }
}));

// ─── Rate Limiting & Body Parsing ─────────────────────────────────────────────
app.use(generalLimiter);
app.use(express.json({ limit: "5mb" }));                        // Supports Base64 profile pic uploads
app.use(express.urlencoded({ extended: true, limit: "5mb" })); // Supports URL-encoded payload

// ─── Fix: Express 5 req.query is read-only getter ─────────────────────────────
app.use((req, res, next) => {
    Object.defineProperty(req, 'query', {
        value: { ...req.query },
        writable: true,
        configurable: true,
        enumerable: true
    });
    next();
});

// ─── Data Sanitization ────────────────────────────────────────────────────────
app.use(mongoSanitize()); // Prevent NoSQL Injection

// ─── Cache-Control Headers ────────────────────────────────────────────────────
// GET  → private, no-cache: browser can cache but must revalidate (enables 304)
// Mutating methods → no-store: never cache write responses
app.use((req, res, next) => {
    if (req.method === 'GET') {
        // "private" → only the user's browser, not CDNs
        // "no-cache" → must revalidate, but allows 304 Not Modified responses
        res.setHeader('Cache-Control', 'private, no-cache');
    } else {
        res.setHeader('Cache-Control', 'no-store');
    }
    next();
});

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.json({
        success: true,
        message: "Server is healthy",
        data: { status: "ok", db: dbStatus, uptime: process.uptime().toFixed(2) + "s" }
    });
});

app.get("/api/health/liveness", (req, res) => {
    res.status(200).json({
        success: true,
        status: "UP",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

app.get("/api/health/readiness", async (req, res) => {
    const dbStatus = mongoose.connection.readyState === 1;
    
    // Check Redis REST client (if configured)
    let redisRestStatus = true;
    const redisRest = require("./config/redis");
    if (redisRest) {
        try {
            await redisRest.ping();
        } catch (_) {
            redisRestStatus = false;
        }
    }

    // Check Redis IORedis TCP connection (if configured)
    let redisTcpStatus = true;
    const redisTcp = require("./config/ioredis");
    if (redisTcp) {
        if (redisTcp.status !== "ready") {
            redisTcpStatus = false;
        }
    }

    const isReady = dbStatus && redisRestStatus && redisTcpStatus;

    const response = {
        success: isReady,
        status: isReady ? "READY" : "NOT_READY",
        timestamp: new Date().toISOString(),
        checks: {
            database: dbStatus ? "UP" : "DOWN",
            redis_rest: redisRest ? (redisRestStatus ? "UP" : "DOWN") : "NOT_CONFIGURED",
            redis_tcp: redisTcp ? (redisTcpStatus ? "UP" : "DOWN") : "NOT_CONFIGURED"
        }
    };

    if (isReady) {
        res.status(200).json(response);
    } else {
        res.status(503).json(response);
    }
});

// ─── API Routes (v1) ─────────────────────────────────────────────────────────
app.use("/api/v1/auth",         require("./routes/authRoutes"));
app.use("/api/v1/transactions", require("./routes/transactionRoutes"));
app.use("/api/v1/categories",   require("./routes/categoryRoutes"));
app.use("/api/v1/budgets",      require("./routes/budgetRoutes"));
app.use("/api/v1/analytics",    require("./routes/analyticsRoutes"));
app.use("/api/v1/search",       require("./routes/searchRoutes"));
app.use("/api/v1/wallet",       require("./routes/walletRoutes"));
app.use("/api/v1/split",        require("./routes/splitRoutes"));
app.use("/api/v1/payment",      require("./routes/paymentRoutes"));
app.use("/api/v1/notifications", require("./routes/notificationRoutes"));
app.use("/api/v1/chat",          require("./routes/chatRoutes"));
app.use("/api/v1/money-requests", require("./routes/moneyRequestRoutes"));
app.use("/api/v1/recurring",     require("./routes/recurringRoutes"));
app.use("/api/v1/savings-goals", require("./routes/savingsGoalRoutes"));
app.use("/api/v1/ocr",           require("./routes/ocrRoutes"));

// ─── Legacy route aliases (keep old /api/* working during migration) ──────────
app.use("/api/auth",         require("./routes/authRoutes"));
app.use("/api/transactions", require("./routes/transactionRoutes"));
app.use("/api/categories",   require("./routes/categoryRoutes"));
app.use("/api/budgets",      require("./routes/budgetRoutes"));
app.use("/api/analytics",    require("./routes/analyticsRoutes"));
app.use("/api/search",       require("./routes/searchRoutes"));
app.use("/api/wallet",       require("./routes/walletRoutes"));
app.use("/api/split",        require("./routes/splitRoutes"));
app.use("/api/payment",      require("./routes/paymentRoutes"));
app.use("/api/notifications", require("./routes/notificationRoutes"));
app.use("/api/chat",         require("./routes/chatRoutes"));
app.use("/api/money-requests", require("./routes/moneyRequestRoutes"));
app.use("/api/recurring",     require("./routes/recurringRoutes"));
app.use("/api/savings-goals", require("./routes/savingsGoalRoutes"));
app.use("/api/ocr",           require("./routes/ocrRoutes"));

// ─── Global Error Handler ─────────────────────────────────────────────────────
const errorHandler = require("./middleware/errorMiddleware");
app.use(errorHandler);

// ─── Start Server Async ───────────────────────────────────────────────────────
const startServer = async () => {
    try {
        await connectDB();

        // ─── Start Server ─────────────────────────────────────────────────────────────
        const http = require('http');
        const { initSocket, getIO } = require('./utils/socket');

        const PORT = process.env.PORT || 5000;
        const server = http.createServer(app);
        initSocket(server);

        // ─── Initialize BullMQ Queue (lazy — only if ioredis is configured) ───────────
        const { insightsQueue, insightsWorker } = require("./queues/insightsQueue");
        const { subscriptionCronQueue, subscriptionCronWorker } = require("./queues/subscriptionCron");
        if (insightsQueue) {
            logger.info("📋 BullMQ AI insights queue active");
        }
        if (subscriptionCronQueue) {
            logger.info("📋 BullMQ Subscription Cron active");
        }

        if (process.env.NODE_ENV !== 'test') {
            server.listen(PORT, () =>
                logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`)
            );
        }

        // ─── Graceful Shutdown ────────────────────────────────────────────────────────
        const shutdown = async (signal) => {
            logger.info(`${signal} received. Starting graceful shutdown...`);
            server.close(async () => {
                logger.info("HTTP server closed.");

                // Close Socket.io
                try {
                    const io = getIO();
                    if (io) { io.close(); logger.info("Socket.io closed."); }
                } catch (err) {
                    logger.error("Error closing Socket.io:", err.message);
                }

                // Close BullMQ worker
                try {
                    if (insightsWorker) { await insightsWorker.close(); logger.info("BullMQ AI insights worker closed."); }
                    if (subscriptionCronWorker) { await subscriptionCronWorker.close(); logger.info("BullMQ Subscription worker closed."); }
                } catch (err) {
                    logger.error("Error closing BullMQ worker:", err.message);
                }

                // Close MongoDB
                try {
                    await mongoose.connection.close();
                    logger.info("MongoDB connection closed.");
                } catch (err) {
                    logger.error("Error closing MongoDB:", err);
                }

                // Close IORedis
                try {
                    const ioRedisConnection = require("./config/ioredis");
                    if (ioRedisConnection) { ioRedisConnection.disconnect(); logger.info("IORedis closed."); }
                } catch (err) {
                    logger.error("Error closing IORedis:", err.message);
                }

                process.exit(0);
            });

            // Force exit after 10 seconds if graceful shutdown hangs
            setTimeout(() => {
                logger.error("Graceful shutdown timed out. Forcing exit.");
                process.exit(1);
            }, 10000);
        };

        process.on("SIGTERM", () => shutdown("SIGTERM"));
        process.on("SIGINT",  () => shutdown("SIGINT"));
        process.on("uncaughtException", (err) => {
            logger.error("Uncaught Exception:", err);
            shutdown("uncaughtException");
        });
        process.on("unhandledRejection", (reason) => {
            logger.error("Unhandled Rejection:", reason);
            shutdown("unhandledRejection");
        });

    } catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
};

startServer();

module.exports = app;
