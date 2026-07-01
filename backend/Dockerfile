# ─── Stage 1: Base ────────────────────────────────────────────────────────────
FROM node:20-alpine AS base
WORKDIR /app
COPY backend/package*.json ./

# ─── Stage 2: Development Dependencies ────────────────────────────────────────
FROM base AS dev-deps
RUN npm ci

# ─── Stage 3: Production Dependencies ─────────────────────────────────────────
FROM base AS prod-deps
RUN npm ci --only=production

# ─── Stage 4: Development ─────────────────────────────────────────────────────
FROM base AS development
COPY --from=dev-deps /app/node_modules ./node_modules
COPY backend/ .
ENV NODE_ENV=development
EXPOSE 5000
CMD ["npm", "run", "dev"]

# ─── Stage 5: Production ──────────────────────────────────────────────────────
FROM node:20-alpine AS production
WORKDIR /app

# Create non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

COPY --from=prod-deps /app/node_modules ./node_modules
COPY . .

# Create logs directory with correct permissions
RUN mkdir -p logs && chown -R appuser:appgroup /app

USER appuser

ENV NODE_ENV=production
EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:5000/api/health || exit 1

CMD ["node", "server.js"]
