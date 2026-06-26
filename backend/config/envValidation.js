const validateEnv = () => {
    const requiredEnv = [
        'MONGO_URI',
        'JWT_SECRET',
        'RAZORPAY_KEY_ID',
        'RAZORPAY_KEY_SECRET',
        'REDIS_URL',
        'REDIS_TOKEN'
    ];
    const missingEnv = requiredEnv.filter((envVar) => !process.env[envVar]);

    if (missingEnv.length > 0) {
        console.error(`[FATAL] Missing required environment variables: ${missingEnv.join(', ')}`);
        console.error('Please check your .env file against .env.example');
        process.exit(1);
    }

    // Optional warnings for deployment configuration
    const optionalEnv = ['NODE_ENV', 'FRONTEND_URL', 'REDIS_IOREDIS_URL'];
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

    // Production-specific warnings
    if (process.env.NODE_ENV === 'production') {
        if (!process.env.FRONTEND_URL) {
            console.warn('[WARNING] FRONTEND_URL is not set in production mode. CORS may not work correctly.');
        }
        if (!process.env.NODE_ENV) {
            console.warn('[WARNING] NODE_ENV is not set. Expected "production" for production deployments.');
        }
    }
};

module.exports = validateEnv;
