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
