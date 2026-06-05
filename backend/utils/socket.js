const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const logger = require('./logger');

let io;
// Map to store userId -> socketId
const userSockets = new Map();

const initSocket = (server) => {
    io = new Server(server, {
        cors: {
            origin: process.env.FRONTEND_URL || 'http://localhost:5173',
            credentials: true,
            methods: ['GET', 'POST']
        }
    });

    // ─── Socket.io Redis Adapter (multi-node broadcasting) ───────────────
    const ioRedisConnection = require('../config/ioredis');
    if (ioRedisConnection) {
        try {
            const { createAdapter } = require('@socket.io/redis-adapter');
            const Redis = require('ioredis');

            // Socket.io adapter needs a dedicated pub/sub pair
            const pubClient = ioRedisConnection;
            const subClient = pubClient.duplicate();

            io.adapter(createAdapter(pubClient, subClient));
            logger.info('[Socket.io] Redis adapter attached — multi-node broadcasting enabled');
        } catch (err) {
            logger.warn('[Socket.io] Redis adapter failed to attach, falling back to single-node:', err.message);
        }
    } else {
        logger.info('[Socket.io] Running in single-node mode (no ioredis configured)');
    }

    // Authentication middleware for sockets
    io.use((socket, next) => {
        try {
            // First try to get token from auth object, then from query, then from cookies if available
            const token = socket.handshake.auth?.token || socket.handshake.query?.token;
            
            if (!token) {
                return next(new Error('Authentication error: No token provided'));
            }

            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            socket.user = decoded;
            next();
        } catch (err) {
            next(new Error('Authentication error: Invalid token'));
        }
    });

    io.on('connection', (socket) => {
        const userId = socket.user.id;
        
        // Add to userSockets map
        userSockets.set(userId, socket.id);
        socket.join(`user:${userId}`);
        logger.info(`User connected to socket: ${userId} and joined room user:${userId}`);

        socket.on('disconnect', () => {
            userSockets.delete(userId);
            logger.info(`User disconnected from socket: ${userId}`);
        });
    });

    return io;
};

// Helper function to send notification to a specific user
const sendNotificationToUser = (userId, notification) => {
    if (!io) {
        logger.error("Socket.io is not initialized");
        return;
    }
    
    io.to(`user:${userId.toString()}`).emit('new_notification', notification);
};

// Getter for the io instance (used for shutdown)
const getIO = () => io;

module.exports = {
    initSocket,
    sendNotificationToUser,
    getIO,
};
