const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const mongoSanitize = require("express-mongo-sanitize");
const cookieParser = require("cookie-parser");
const mongoose = require("mongoose");
const { generalLimiter } = require("./middleware/rateLimitMiddleware");

dotenv.config();

const logger = require("./utils/logger");
const validateEnv = require("./config/envValidation");
const connectDB = require("./config/db");

validateEnv();

// ─── Start Server Async ───────────────────────────────────────────────────────
const startServer = async () => {
    try {
        await connectDB();
        
        // Initialize Trie after DB is connected
        const searchRegistry = require("./utils/trie");
        await searchRegistry.initializeTrie();
        
        const app = express();

        // ─── Security Middleware ──────────────────────────────────────────────────────
        app.use(helmet());
        app.use(cors({
            origin: process.env.FRONTEND_URL || ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175'],
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
        app.use(express.json({ limit: "10kb" }));                        // Limit JSON payload (DoS prevention)
        app.use(express.urlencoded({ extended: true, limit: "10kb" })); // Limit URL-encoded payload

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

        // ─── Health Check ─────────────────────────────────────────────────────────────
        app.get("/api/health", (req, res) => {
            const dbStatus = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
            res.json({
                success: true,
                message: "Server is healthy",
                data: { status: "ok", db: dbStatus, uptime: process.uptime().toFixed(2) + "s" }
            });
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

        // ─── Global Error Handler ─────────────────────────────────────────────────────
        const errorHandler = require("./middleware/errorMiddleware");
        app.use(errorHandler);

        // ─── Start Server ─────────────────────────────────────────────────────────────
        const http = require('http');
        const { initSocket } = require('./utils/socket');

        const PORT = process.env.PORT || 5000;
        const server = http.createServer(app);
        initSocket(server);

        server.listen(PORT, () =>
            logger.info(`🚀 Server running on port ${PORT} [${process.env.NODE_ENV || 'development'}]`)
        );

        // ─── Graceful Shutdown ────────────────────────────────────────────────────────
        const shutdown = async (signal) => {
            logger.info(`${signal} received. Starting graceful shutdown...`);
            server.close(async () => {
                logger.info("HTTP server closed.");
                try {
                    await mongoose.connection.close();
                    logger.info("MongoDB connection closed.");
                } catch (err) {
                    logger.error("Error closing MongoDB:", err);
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

