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
    await mongoose.connection.close();
}, 10000);

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uniqueEmail = () => `test_${Date.now()}@example.com`;
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
            .send({ email: 'nobody@nowhere.com', password: validPassword });

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
            .send({ data: 'x'.repeat(11000) });

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
