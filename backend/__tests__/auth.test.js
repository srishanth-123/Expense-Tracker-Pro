/**
 * Auth Route Integration Tests
 * Run with: npm test
 *
 * These tests spin up the Express app with supertest (no actual port binding)
 * and hit the auth endpoints directly. MongoDB and Redis connections are real
 * (uses values from .env) — tests use a unique email each run to avoid conflicts.
 */

const request = require('supertest');
const mongoose = require('mongoose');

// Load env before importing app
require('dotenv').config();

// Import app without starting the server
let app;
beforeAll(async () => {
    // Dynamically import so we control timing
    app = require('../server');
    // Give connections a moment to initialize
    await new Promise((r) => setTimeout(r, 2000));
}, 15000);

afterAll(async () => {
    // 1. Close MongoDB connection
    await mongoose.connection.close();

    // 2. Close Socket.io if initialized
    try {
        const { getIO } = require('../utils/socket');
        const io = getIO();
        if (io) {
            io.close();
        }
    } catch (err) {
        console.error("Error closing Socket.io in test:", err.message);
    }

    // 3. Close BullMQ workers and queues
    try {
        const { insightsQueue, insightsWorker } = require("../queues/insightsQueue");
        const { subscriptionCronQueue, subscriptionCronWorker } = require("../queues/subscriptionCron");
        if (insightsWorker) await insightsWorker.close();
        if (insightsQueue) await insightsQueue.close();
        if (subscriptionCronWorker) await subscriptionCronWorker.close();
        if (subscriptionCronQueue) await subscriptionCronQueue.close();
    } catch (err) {
        console.error("Error closing BullMQ in test:", err.message);
    }

    // 4. Close IORedis TCP connections
    try {
        const ioRedisConnection = require("../config/ioredis");
        if (ioRedisConnection) {
            await ioRedisConnection.quit();
        }
    } catch (err) {
        console.error("Error closing IORedis in test:", err.message);
    }

    // Give asynchronous close operations a brief moment to settle
    await new Promise((r) => setTimeout(r, 1000));
}, 15000);


// ─── Helpers ──────────────────────────────────────────────────────────────────
const uniqueEmail = () => `test_${Date.now()}@gmail.com`;
const validPassword = 'TestPass1';

// ─── Registration Tests ───────────────────────────────────────────────────────
describe('POST /api/auth/register', () => {
    it('should register a new user and return 201 with token', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Test User', email: uniqueEmail(), password: validPassword });

        expect(res.statusCode).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('token');
        expect(res.body.data).toHaveProperty('email');
        expect(res.body.data).not.toHaveProperty('password');
    });

    it('should return 400 for duplicate email', async () => {
        const email = uniqueEmail();
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'User One', email, password: validPassword });

        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'User Two', email, password: validPassword });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/already exists/i);
    });

    it('should return 400 for weak password (no uppercase)', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Test', email: uniqueEmail(), password: 'alllowercase1' });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for password with no number', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Test', email: uniqueEmail(), password: 'NoNumbers' });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid email format', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Test', email: 'not-an-email', password: validPassword });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 400 for non-Gmail email domain', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({ name: 'Test', email: 'user@example.com', password: validPassword });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
        expect(res.body.message).toMatch(/Only Gmail addresses/i);
    });
});

// ─── Login Tests ──────────────────────────────────────────────────────────────
describe('POST /api/auth/login', () => {
    let testEmail;

    beforeAll(async () => {
        testEmail = uniqueEmail();
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'Login Test', email: testEmail, password: validPassword });
    });

    it('should login with valid credentials and return 200', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: testEmail, password: validPassword });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('token');
    });

    it('should return 401 for wrong password', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: testEmail, password: 'WrongPass1' });

        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it('should return 401 for non-existent email', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'nobody@gmail.com', password: validPassword });

        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it('should block NoSQL injection in email field', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: { $gt: '' }, password: validPassword });

        // Should NOT return 200 (login success)
        expect(res.statusCode).not.toBe(200);
    });
});

// ─── Get Profile Tests ────────────────────────────────────────────────────────
describe('GET /api/auth/me', () => {
    let token;

    beforeAll(async () => {
        const email = uniqueEmail();
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'Profile Test', email, password: validPassword });
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email, password: validPassword });
        token = loginRes.body.data.token;
    });

    it('should return user profile with valid token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).not.toHaveProperty('password');
    });

    it('should return 401 without token', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });

    it('should return 401 with invalid token', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer invalidtoken123');
        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });
});

// ─── Security Tests ───────────────────────────────────────────────────────────
describe('Security — Rate Limiting & Payload', () => {
    it('should return 413 for oversized JSON payload', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ data: 'x'.repeat(5500000) });

        expect(res.statusCode).toBe(413);
    });

    it('should return valid JSON envelope on all error responses', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: 'bad', password: '' });

        expect(res.body).toHaveProperty('success', false);
        expect(res.body).toHaveProperty('message');
    });
});

// ─── Payment Failure Tests ──────────────────────────────────────────────────
describe('POST /api/payment/fail', () => {
    let token;
    let orderId;

    beforeAll(async () => {
        const email = uniqueEmail();
        await request(app)
            .post('/api/auth/register')
            .send({ name: 'Payment Test User', email, password: validPassword });
        const loginRes = await request(app)
            .post('/api/auth/login')
            .send({ email, password: validPassword });
        token = loginRes.body.data.token;

        // Create a pending payment order
        const orderRes = await request(app)
            .post('/api/payment/create-order')
            .set('Authorization', `Bearer ${token}`)
            .send({ amount: 100, purpose: 'wallet_topup' });
        
        // Handle potential variations in response structure
        const bodyData = orderRes.body.data || orderRes.body;
        orderId = bodyData.orderId || bodyData.id;
    });

    it('should log a failed payment and create a failed WalletTransaction', async () => {
        const rId = `pay_fail_${Date.now()}`;
        const res = await request(app)
            .post('/api/payment/fail')
            .set('Authorization', `Bearer ${token}`)
            .send({
                razorpay_order_id: orderId,
                razorpay_payment_id: rId,
                reason: 'Declined by bank'
            });

        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);

        // Verify that the Payment model status is indeed "failed"
        const Payment = require('../models/Payment');
        const paymentDoc = await Payment.findOne({ orderId });
        expect(paymentDoc).not.toBeNull();
        expect(paymentDoc.status).toBe('failed');

        // Verify that a failed WalletTransaction exists for the user
        const WalletTransaction = require('../models/WalletTransaction');
        const tx = await WalletTransaction.findOne({ referenceId: rId });
        expect(tx).not.toBeNull();
        expect(tx.status).toBe('failed');
        expect(tx.amount).toBe(100);
    });

    it('should return 400 if razorpay_order_id is missing', async () => {
        const res = await request(app)
            .post('/api/payment/fail')
            .set('Authorization', `Bearer ${token}`)
            .send({ reason: 'No order ID' });

        expect(res.statusCode).toBe(400);
        expect(res.body.success).toBe(false);
    });

    it('should return 404 if order does not exist', async () => {
        const res = await request(app)
            .post('/api/payment/fail')
            .set('Authorization', `Bearer ${token}`)
            .send({ razorpay_order_id: 'nonexistent_order_id' });

        expect(res.statusCode).toBe(404);
        expect(res.body.success).toBe(false);
    });
});

