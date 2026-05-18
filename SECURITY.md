# Security Improvements — Expense Tracker

This file explains all the security features added to the project in simple terms.

---

## 1. Secure HTTP Headers

**What it does:** Adds extra information to every server response that tells the browser how to behave safely.

**Why it matters:** Without this, attackers can trick the browser into doing things like loading the app inside another website (clickjacking) or running malicious scripts.

**How it is implemented:**
- Installed the `helmet` package
- Added it as the very first middleware in `server.js` so it applies to every request
```js
// server.js
const helmet = require("helmet");
app.use(helmet());
```

---

## 2. CORS — Who Can Talk to the Backend

**What it does:** Only allows the frontend (running on `localhost:5173`) to make requests to the backend. All other origins are blocked.

**Why it matters:** Without this, any website on the internet could make API calls to your backend on behalf of your users.

**How it is implemented:**
- Configured `cors` middleware in `server.js` with a strict origin, allowed methods, and credentials support
```js
// server.js
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
```

---

## 3. Rate Limiting — Limiting How Many Requests Someone Can Make

**What it does:** Puts a limit on how many times someone can call an API in a short time.

| Route | Limit |
|---|---|
| Login / Register | 10 requests per 15 minutes |
| Payment | 20 requests per 15 minutes |
| Wallet / Split | 30 requests per 15 minutes |
| Everything else | 100 requests per 15 minutes |

**Why it matters:** Prevents attackers from spamming your login page or payment API thousands of times per second.

**How it is implemented:**
- Created `middleware/rateLimitMiddleware.js` with separate limiters for each route type
- Applied each limiter to its corresponding route file
```js
// middleware/rateLimitMiddleware.js
const rateLimit = require('express-rate-limit');

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, ... });
const paymentLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, ... });
const walletLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, ... });
const generalLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 100, ... });

// routes/authRoutes.js
router.post("/login", authLimiter, validateLogin, loginUser);
```

---

## 4. Payload Size Limit

**What it does:** Rejects any request whose body is larger than 10KB. Returns a `413 Payload Too Large` error.
**Why it matters:** An attacker could send a huge file (e.g., 100MB) to crash or slow down your server. This blocks that.

**How it is implemented:**
- Set a size limit directly on Express JSON and URL-encoded parsers in `server.js`
- Updated `errorMiddleware.js` to catch the payload error and return a clean JSON response
```js
// server.js
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// middleware/errorMiddleware.js
if (err.type === 'entity.too.large' || err.status === 413) {
    return res.status(413).json({ success: false, message: 'Payload too large. Max size is 10kb.' });
}
```

---

## 5. Input Sanitization — Blocking Injection Attacks

**What it does:** Removes dangerous MongoDB operators like `$gt`, `$where` from any request body or query.

**Why it matters:** Without this, someone could send `{ "email": { "$gt": "" } }` and bypass your login check entirely, getting into any account.

**How it is implemented:**
- Installed `express-mongo-sanitize` and applied it after the body parser in `server.js`
- Added a small custom middleware to make it compatible with Express 5
```js
// server.js
const mongoSanitize = require("express-mongo-sanitize");

// Fix for Express 5 — req.query is read-only by default
app.use((req, res, next) => {
    Object.defineProperty(req, 'query', {
        value: { ...req.query }, writable: true, configurable: true
    });
    next();
});

app.use(mongoSanitize());
```

---

## 6. JWT Stored in HttpOnly Cookie

**What it does:** Instead of storing your login token in `localStorage` (which any script on the page can read), it is now stored in a special cookie that JavaScript cannot access.

**Why it matters:** If someone injects a malicious script into your page (XSS attack), they cannot steal the token because it is in an HttpOnly cookie.

**How it is implemented:**
- Installed `cookie-parser` and added it to `server.js`
- In `authController.js`, created a `sendTokenCookie` helper that sets the cookie on every login and register
- Updated `authMiddleware.js` to read the token from the cookie first, then fall back to the `Authorization` header
```js
// authController.js
const sendTokenCookie = (res, token) => {
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60 * 1000  // 30 days
    });
};

// authMiddleware.js
if (req.cookies && req.cookies.token) {
    token = req.cookies.token;
} else if (req.headers.authorization?.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
}
```

---

## 7. Account Lockout After Failed Logins

**What it does:** If someone tries to log in with the wrong password 5 times in a row, the account is locked for 15 minutes. The user is told how many attempts remain and how long the lock lasts.

**Why it matters:** Prevents attackers from trying thousands of password combinations (brute force attack) to get into an account.

**How it is implemented:**
- In `authController.js`, every failed login increments a Redis key named `login_fail:<email>`
- If the count hits 5, the key is given a 15-minute expiry and the account is locked
- On successful login, the key is deleted
```js
// authController.js
const failKey = `login_fail:${email.toLowerCase()}`;

// Check if already locked
const attempts = await redis.get(failKey);
if (attempts >= 5) {
    return res.status(429).json({ message: "Account locked for 15 minutes." });
}

// On wrong password
await redis.incr(failKey);
await redis.expire(failKey, 900); // 15 min

// On success
await redis.del(failKey);
```

---

## 8. Password Strength Rules

**What it does:** When registering, the password must be at least 8 characters, contain one uppercase letter, and contain one number.

**Why it matters:** Weak passwords like `"123456"` are the first thing attackers try. Strong rules make accounts much harder to crack.

**How it is implemented:**
- Updated `middleware/validationMiddleware.js` using `express-validator`
- Rules are checked before the request even reaches the controller
```js
// middleware/validationMiddleware.js
body('password')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
    .matches(/[A-Z]/).withMessage('Must contain at least one uppercase letter')
    .matches(/[0-9]/).withMessage('Must contain at least one number')
```

---

## 9. Database-Level Validation

**What it does:** Even at the database level, data is validated before saving. Email must be a valid format, name must be 2–50 characters, wallet balance can never go below 0.

**Why it matters:** Acts as the last line of defense even if API validation is somehow bypassed.

**How it is implemented:**
- Updated `models/user.js` Mongoose schema with `required`, `match`, `minlength`, `maxlength`, and `min` constraints
```js
// models/user.js
name: { type: String, required: true, trim: true, minlength: 2, maxlength: 50 },
email: { type: String, required: true, unique: true, match: /^\S+@\S+\.\S+$/ },
password: { type: String, required: true, minlength: 8 },
walletBalance: { type: Number, default: 0, min: 0 }
```

---

## 10. Consistent API Responses

**What it does:** Every API response follows the same structure so the frontend always knows what to expect.

```json
{ "success": true, "message": "Login successful", "data": { ... } }
```

**Why it matters:** Makes error handling predictable and prevents the frontend from crashing due to unexpected response shapes.

**How it is implemented:**
- Updated every controller to use this structure
- Added a response interceptor in `frontend/src/api.js` to automatically unwrap the `data` field
- Error stack traces are hidden in production
```js
// frontend/src/api.js
api.interceptors.response.use((response) => {
    if (response.data?.success !== undefined) {
        return response.data.data ?? response.data;
    }
    return response.data;
});
```

---

## 11. Structured Logging (Winston)

**What it does:** All server activity is logged in a structured format to files. Console output is colorized in development.

**Why it matters:** `console.log` is not enough for production. You need searchable, leveled logs that can be monitored.

**How it is implemented:**
- Installed `winston` and created `utils/logger.js`
- Morgan HTTP logs are piped through Winston instead of printing directly
- Log files rotate at 5MB, keeping the last 5 files
```js
// utils/logger.js
const logger = createLogger({
    transports: [
        new transports.File({ filename: 'logs/error.log', level: 'error' }),
        new transports.File({ filename: 'logs/combined.log' })
    ]
});

// server.js
app.use(morgan("combined", {
    stream: { write: (msg) => logger.info(msg.trim()) }
}));
```

---

## 12. Graceful Shutdown

**What it does:** When the server is stopped, it finishes current requests, closes the database, then exits cleanly. Forces exit after 10 seconds if something hangs.

**Why it matters:** Stopping the server abruptly mid-request can corrupt data or leave database connections open.

**How it is implemented:**
- Added shutdown handlers at the bottom of `server.js`
```js
// server.js
const shutdown = async (signal) => {
    server.close(async () => {
        await mongoose.connection.close();
        process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000); // Force exit after 10s
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
```

---

## 13. Environment Variable Validation at Startup

**What it does:** The server checks all required config values exist before starting. If anything is missing it exits immediately with a clear message.

**Why it matters:** Prevents the server from starting with a broken config and crashing mid-use.

**How it is implemented:**
- Updated `config/envValidation.js` to check all 6 required variables
- Called at the very top of `server.js` before anything else
```js
// config/envValidation.js
const required = ['MONGO_URI', 'JWT_SECRET', 'RAZORPAY_KEY_ID',
                  'RAZORPAY_KEY_SECRET', 'REDIS_URL', 'REDIS_TOKEN'];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
    console.error(`Missing env vars: ${missing.join(', ')}`);
    process.exit(1);
}
```

---

## 14. API Versioning

**What it does:** All routes are available under `/api/v1/...`. Old `/api/...` routes still work as aliases.

**Why it matters:** In future, breaking changes can go to `/api/v2/...` without breaking existing clients on `/api/v1/...`.

**How it is implemented:**
- Added a duplicate set of route registrations in `server.js`
```js
// server.js
app.use("/api/v1/auth",         require("./routes/authRoutes"));
app.use("/api/v1/transactions", require("./routes/transactionRoutes"));
// ... other v1 routes

// Legacy aliases — keeps old routes working
app.use("/api/auth",            require("./routes/authRoutes"));
app.use("/api/transactions",    require("./routes/transactionRoutes"));
```

---

## 15. React Error Boundary (Frontend)

**What it does:** Wraps the entire frontend app. If any component crashes, it shows a friendly error screen with a Refresh button instead of a blank white page.

**Why it matters:** One component crashing should not take down the entire app with no explanation.

**How it is implemented:**
- Created `frontend/src/components/ErrorBoundary.jsx` as a class component
- Wrapped the app in `main.jsx`
```jsx
// main.jsx
import ErrorBoundary from './components/ErrorBoundary.jsx'

<ErrorBoundary>
  <App />
</ErrorBoundary>
```

---

## 16. Health Check Endpoint

**What it does:** A `GET /api/health` route that returns server status, DB connection state, and uptime.

**Why it matters:** Used by Docker, cloud platforms, and uptime monitors to check if the server is alive and restart it if needed.

**How it is implemented:**
- Added a simple route in `server.js` before all other routes
```js
// server.js
app.get("/api/health", (req, res) => {
    const db = mongoose.connection.readyState === 1 ? "connected" : "disconnected";
    res.json({ success: true, data: { status: "ok", db, uptime: process.uptime() + "s" } });
});
```

---

## 17. Docker Setup

**What it does:** The entire app can be started with one command using Docker.
```bash
docker compose up
```

**Why it matters:** Makes the app run the same way on any machine. No "works on my machine" issues.

**How it is implemented:**
- Created `backend/Dockerfile` using a multi-stage build to keep the image small
- Server runs as a **non-root user** inside the container for safety
- Created `docker-compose.yml` to start backend and frontend together
- Created `.dockerignore` to exclude `.env`, `node_modules`, and test files from the image

---

## 18. Automated Tests

**What it does:** Automated tests that check all the auth routes work correctly and securely.

**Why it matters:** Any future code change that accidentally breaks login or registration will be caught immediately.

**How it is implemented:**
- Installed `jest` and `supertest` as dev dependencies
- Created `__tests__/auth.test.js` with tests for:
  - Register new user → 201
  - Duplicate email → 400
  - Weak password → 400
  - Valid login → 200
  - Wrong password → 401
  - NoSQL injection → blocked
  - No token → 401
  - Oversized payload → 413

```bash
# Run tests
npm test

# Run with coverage report
npm run test:coverage
```

---

*Total: 18 security improvements — covering authentication, validation, rate limiting, logging, and infrastructure.*
