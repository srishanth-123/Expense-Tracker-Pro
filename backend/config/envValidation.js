const logger = require("../utils/logger");

const validateEnv = () => {
    const requiredEnv = [
        'MONGO_URI',
        'JWT_SECRET',
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET'
    ];

    if (process.env.DISABLE_REDIS_CACHE !== 'true') {
        requiredEnv.push('REDIS_URL', 'REDIS_TOKEN');
    }

    const missingEnv = requiredEnv.filter((envVar) => !process.env[envVar]);

    if (missingEnv.length > 0) {
        console.error(`[FATAL] Missing required environment variables: ${missingEnv.join(', ')}`);
        console.error('Please check your .env file against .env.example');
        process.exit(1);
    }

    // JWT secret strength check
    const jwtSecret = process.env.JWT_SECRET;
    if (jwtSecret === 'your_64_character_hex_secret_here' || jwtSecret === 'your_separate_64_character_hex_refresh_secret') {
        console.error('[FATAL] You are using placeholder JWT secrets. Please change JWT_SECRET in your .env file.');
        process.exit(1);
    }
    if (jwtSecret.length < 32) {
        if (process.env.NODE_ENV === 'production') {
            console.error('[FATAL] JWT_SECRET must be at least 32 characters long in production for security.');
            process.exit(1);
        } else {
            console.warn('[WARNING] JWT_SECRET is short (<32 characters). Consider generating a stronger secret.');
        }
    }

    // Optional warnings for deployment configuration
    const optionalEnv = ['NODE_ENV', 'FRONTEND_URL', 'REDIS_IOREDIS_URL', 'COOKIE_SECRET'];
    optionalEnv.forEach((envVar) => {
        if (!process.env[envVar]) {
            console.warn(`[WARNING] Optional environment variable "${envVar}" is missing. (Standard for development; verify for production)`);
        }
    });

    // Email (Resend) — without these, payment-success emails are silently skipped
    if (!process.env.RESEND_API_KEY) {
        console.warn('[WARNING] RESEND_API_KEY is missing. Transactional emails (e.g. payment receipts) will be disabled.');
    } else if (!process.env.EMAIL_FROM) {
        console.warn('[WARNING] EMAIL_FROM is missing. Transactional emails will be disabled until a sender address is set.');
    }

    // AI assistant / insights — without a configured provider key, the app
    // falls back to rule-based logic (features still work, just non-AI).
    const aiProvider = (process.env.AI_PROVIDER || 'openai').toLowerCase();
    const aiKeyByProvider = {
        openai: 'OPENAI_API_KEY',
        anthropic: 'ANTHROPIC_API_KEY',
        gemini: 'GEMINI_API_KEY',
        grok: 'GROK_API_KEY'
    };
    const expectedAiKey = aiKeyByProvider[aiProvider];
    if (!expectedAiKey) {
        console.warn(`[WARNING] Unknown AI_PROVIDER "${aiProvider}". Expected one of: openai, anthropic, gemini, grok. AI features will use rule-based fallback.`);
    } else if (!process.env[expectedAiKey]) {
        console.warn(`[WARNING] ${expectedAiKey} is missing for AI_PROVIDER="${aiProvider}". AI features will use rule-based fallback.`);
    }

    // Production-specific hardening checks
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.FRONTEND_URL) {
            console.warn('[WARNING] FRONTEND_URL is not set in production mode. CORS may not work correctly.');
        }
        
        // Razorpay test key warning in production
        if (process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_ID.startsWith('rzp_test_')) {
            console.warn('[WARNING] RAZORPAY_KEY_ID is using a test key (rzp_test_...) in production mode. Payment processing will be in sandbox mode.');
        }

        // Cookie Secret check
        if (!process.env.COOKIE_SECRET) {
            console.error('[FATAL] COOKIE_SECRET must be set in production mode to sign cookie sessions.');
            process.exit(1);
        } else if (process.env.COOKIE_SECRET === 'your_cookie_secret_here') {
            console.error('[FATAL] Insecure placeholder value used for COOKIE_SECRET in production.');
            process.exit(1);
        }
    }
};

module.exports = validateEnv;
