# Expense Tracker Pro — Backend Server API Documentation

The backend server is a high-performance **Node.js, Express, and Socket.io** REST & WebSocket server. It coordinates Mongoose ODM interactions, manages conversational AI intents via Gemini Pro, protects distributed state with Upstash Redis, and executes critical financial transactions using Saga Orchestration.

---

## 🏗️ Core Architectures & Patterns

### 1. Transactional Saga Orchestrator (`services/saga.service.js`)
To guarantee ledger consistency across distributed collections, multi-step actions execute under the Saga pattern. If any step fails, the orchestrator halts and triggers matching compensation steps in reverse order:
- **P2P Split Settlement Saga (`runSplitSettlementSaga`)**: Debits sender wallet, credits receiver, logs audit transactions, writes split status, and records a budget transaction.
- **Razorpay Wallet Top-up Saga (`runWalletTopupSaga`)**: Resolves pending orders to success and credits the wallet balance post-signature verification.
- **Pro Upgrade Saga (`runProSubscriptionUpgradeSaga`)**: Deducts subscription fees and updates user tier to Pro.
- **UPI Withdrawal Saga (`runWalletWithdrawalSaga`)**: Simulates external payouts; rejects and rolls back balances for transfers > ₹10,000 to demonstrate safety.

### 2. FinPilot AI Conversational Engine (`services/chatbot/`)
- **RAG Context Grounding**: Builds a personalized query context (recent logs, active budgets, wallet states) and injects it into Gemini Pro.
- **Upstash Redis State Machine**: Tracks user dialog states (`Idle`, `AwaitingFields`, `AwaitingResolution`, `AwaitingConfirmation`) with a 15-minute expiration, supporting conversational corrections, entity adjustments, and soft-delete restorations mid-flow.

### 3. Dual-Tier Search Cache & Aggregations
- **Autocomplete Caching**: Search queries hit an L1 local LRU in-memory cache and L2 Upstash Redis cache for instant search responses, with active invalidation hooks on transaction changes.
- **AI Insights Queue**: Heavy analytical z-score outliers and monthly spend reports run as background BullMQ worker processes, notifying users via WebSocket events when complete.

### 4. Failed Payment Tracking & Audit
- **Endpoint**: `POST /api/payment/fail`
- **Purpose**: Receives reports when Razorpay checkouts fail or are cancelled/dismissed by users. It transitions the `Payment` document status to `"failed"` and logs a corresponding failed entry in the `WalletTransaction` collection (`status: "failed"`), providing a comprehensive ledger history of failed payment attempts.

---

## 🔒 Security Hardening

1. **Restricted Wallet Access**: Eliminated insecure wallet REST increment hooks. Updates occur strictly through Razorpay webhook signature hashing (HMAC-SHA256) or system-controlled settlements.
2. **Brute-Force Lockout**: Automatically locks user profiles for 1 hour after 5 consecutive password failures.
3. **Data Sanitization**: Includes NoSQL sanitization via `express-mongo-sanitize` to strip logical operators from request params.
4. **Fallback Rate Limiting**: Uses Upstash Redis rate limiters with memory-map fallbacks when Redis is offline.

---

## ⚙️ Environment Configuration

Create a `.env` file in the backend root:
```env
PORT=5000
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_jwt_signature_secret
GEMINI_API_KEY=your_gemini_api_key
REDIS_URL=your_upstash_redis_rest_url
REDIS_TOKEN=your_upstash_redis_rest_token
BULL_REDIS_URL=your_bullmq_ioredis_url
```

---

## 🚀 Running the Server

### Installation
```bash
npm install
```

### Run Developer Server
```bash
npm run dev
```

### Run Integration Tests
Executes the Jest test suite covering auth validations, transaction sagas, and budget checks:
```bash
npm test
```
