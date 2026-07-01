const swaggerJSDoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Expense Tracker Pro API',
            version: '1.0.0',
            description: 'Enterprise-grade OpenAPI 3.0 API documentation for Expense Tracker Pro.',
        },
        servers: [
            {
                url: '/api/v1',
                description: 'Primary API Gateway (v1)'
            },
            {
                url: '/api',
                description: 'Legacy API Gateway'
            }
        ],
        components: {
            securitySchemes: {
                cookieAuth: {
                    type: 'apiKey',
                    in: 'cookie',
                    name: 'token',
                    description: 'HttpOnly Session Token Cookie'
                },
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Optional Bearer token header authorization (Authorization: Bearer <JWT>)'
                }
            },
            schemas: {
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        walletBalance: { type: 'number' },
                        isPro: { type: 'boolean' },
                        plan: { type: 'string', enum: ['FREE', 'PRO'] }
                    }
                },
                Transaction: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        amount: { type: 'number' },
                        type: { type: 'string', enum: ['income', 'expense'] },
                        category: { type: 'string', description: 'Category ID or Object' },
                        description: { type: 'string' },
                        date: { type: 'string', format: 'date-time' }
                    }
                },
                Budget: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        category: { type: 'string' },
                        limit: { type: 'number' },
                        spentAmount: { type: 'number' },
                        month: { type: 'integer' },
                        year: { type: 'integer' },
                        exceeded: { type: 'boolean' }
                    }
                },
                Split: {
                    type: 'object',
                    properties: {
                        id: { type: 'string' },
                        amount: { type: 'number' },
                        paidBy: { type: 'string' },
                        description: { type: 'string' },
                        participants: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    user: { type: 'string' },
                                    name: { type: 'string' },
                                    share: { type: 'number' },
                                    status: { type: 'string', enum: ['pending', 'paid'] }
                                }
                            }
                        },
                        status: { type: 'string', enum: ['pending', 'settled'] }
                    }
                }
            }
        },
        security: [
            { cookieAuth: [] },
            { bearerAuth: [] }
        ],
        paths: {
            '/auth/register': {
                post: {
                    summary: 'Register a new user',
                    tags: ['Authentication'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['name', 'email', 'password'],
                                    properties: {
                                        name: { type: 'string' },
                                        email: { type: 'string', format: 'email' },
                                        password: { type: 'string', minLength: 8 }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: 'User registered successfully' },
                        400: { description: 'User already exists or invalid data' }
                    }
                }
            },
            '/auth/login': {
                post: {
                    summary: 'Authenticate user & retrieve session',
                    tags: ['Authentication'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['email', 'password'],
                                    properties: {
                                        email: { type: 'string', format: 'email' },
                                        password: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Logged in successfully, cookie token set' },
                        401: { description: 'Invalid credentials or account locked' }
                    }
                }
            },
            '/auth/logout': {
                post: {
                    summary: 'Revoke active session & clear cookies',
                    tags: ['Authentication'],
                    responses: {
                        200: { description: 'Cookie cleared successfully' }
                    }
                }
            },
            '/wallet/balance': {
                get: {
                    summary: 'Get wallet balance',
                    tags: ['Wallet'],
                    responses: {
                        200: { description: 'Current wallet status and balance' }
                    }
                }
            },
            '/transactions': {
                get: {
                    summary: 'Get transactions (paginated & filtered)',
                    tags: ['Transactions'],
                    parameters: [
                        { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
                        { name: 'limit', in: 'query', schema: { type: 'integer', default: 10 } },
                        { name: 'type', in: 'query', schema: { type: 'string', enum: ['income', 'expense'] } }
                    ],
                    responses: {
                        200: { description: 'List of transaction objects' }
                    }
                },
                post: {
                    summary: 'Add a new transaction',
                    tags: ['Transactions'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['amount', 'type', 'category'],
                                    properties: {
                                        amount: { type: 'number' },
                                        type: { type: 'string', enum: ['income', 'expense'] },
                                        category: { type: 'string' },
                                        description: { type: 'string' },
                                        date: { type: 'string', format: 'date' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: 'Transaction created successfully' }
                    }
                }
            },
            '/transactions/bulk': {
                post: {
                    summary: 'Bulk upload transactions',
                    tags: ['Transactions'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['transactions'],
                                    properties: {
                                        transactions: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    amount: { type: 'number' },
                                                    type: { type: 'string', enum: ['income', 'expense'] },
                                                    category: { type: 'string' },
                                                    description: { type: 'string' },
                                                    date: { type: 'string', format: 'date' }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: 'Bulk transactions added successfully' }
                    }
                }
            },
            '/budgets': {
                get: {
                    summary: 'List user budgets',
                    tags: ['Budgets'],
                    responses: {
                        200: { description: 'User budget objects' }
                    }
                },
                post: {
                    summary: 'Create or update budget limit',
                    tags: ['Budgets'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['category', 'limit', 'month', 'year'],
                                    properties: {
                                        category: { type: 'string' },
                                        limit: { type: 'number' },
                                        month: { type: 'integer' },
                                        year: { type: 'integer' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'Budget configured successfully' }
                    }
                }
            },
            '/analytics/financial-health': {
                get: {
                    summary: 'Get AI/Rule-based financial health score',
                    tags: ['Analytics'],
                    responses: {
                        200: { description: 'Financial health score card' }
                    }
                }
            },
            '/notifications': {
                get: {
                    summary: 'List user notifications',
                    tags: ['Notifications'],
                    responses: {
                        200: { description: 'Array of notifications' }
                    }
                }
            },
            '/chat': {
                post: {
                    summary: 'Chat with FinPilot AI assistant',
                    tags: ['FinPilot'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['message'],
                                    properties: {
                                        message: { type: 'string' }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        200: { description: 'AI assistant reply' }
                    }
                }
            },
            '/payment/order': {
                post: {
                    summary: 'Create Razorpay payment order for upgrade',
                    tags: ['Payments'],
                    responses: {
                        200: { description: 'Razorpay order details' }
                    }
                }
            },
            '/split': {
                post: {
                    summary: 'Create a split expense bill',
                    tags: ['Split Expenses'],
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: {
                                    type: 'object',
                                    required: ['amount', 'description', 'participants', 'splitType'],
                                    properties: {
                                        amount: { type: 'number' },
                                        description: { type: 'string' },
                                        splitType: { type: 'string', enum: ['equal', 'custom', 'percentage'] },
                                        participants: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    email: { type: 'string' },
                                                    share: { type: 'number' }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    },
                    responses: {
                        201: { description: 'Split bill logged successfully' }
                    }
                }
            }
        }
    },
    apis: []
};

const swaggerSpec = swaggerJSDoc(options);

const setupSwagger = (app) => {
    if (process.env.NODE_ENV !== 'production') {
        app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
        console.log('📖 API Swagger documentation available at http://localhost:5000/api/docs');
    }
};

module.exports = setupSwagger;
