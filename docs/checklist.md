# Production Release Readiness Checklist

This checklist must be verified before tags are pushed or deployment blueprints are triggered.

## 1. Environment & Config Hardening
- [ ] No secrets are checked into the codebase or `.env` files.
- [ ] `NODE_ENV` is explicitly set to `production`.
- [ ] `JWT_SECRET` is at least 32 characters long, secure, and unique.
- [ ] `COOKIE_SECRET` is configured and randomized.
- [ ] `FRONTEND_URL` is set to the correct production URL (or a comma-separated list of whitelisted domains) to restrict CORS origins.

## 2. Docker & Container Security
- [ ] The base Docker image versions are locked (e.g. `node:20-alpine`, not `node:latest`).
- [ ] The running user in Dockerfiles is non-root (`appuser`).
- [ ] Log limits are configured in the compose file (`max-size: 10m`, `max-file: 3`).
- [ ] Docker Compose has been verified via `docker compose config`.

## 3. Databases & Cache
- [ ] MongoDB indexes have finished building on active collections.
- [ ] MongoDB connection pool limits have been validated.
- [ ] Upstash Redis connection is established and healthy.
- [ ] Cache Versioning is active for searches, budgets, and notifications.

## 4. Observability & Routing
- [ ] Winston logs are routed to `stdout` / `stderr` in JSON format for Docker capturing.
- [ ] Request IDs are verified on headers (`X-Request-ID`) and logged in all trace lines.
- [ ] Health checks (/api/health/liveness, /api/health/readiness) return correct statuses.

## 5. Security & TLS
- [ ] SSL certificates are active (enforced automatically by Render / Vercel).
- [ ] Helmet headers are present on all responses.
- [ ] Rate limits are active on authentication and transactional routes.
