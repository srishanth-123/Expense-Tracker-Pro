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
};

module.exports = validateEnv;
