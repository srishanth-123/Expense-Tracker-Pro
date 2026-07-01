# ─── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# Run production build
RUN npm run build

# ─── Stage 2: Serve ──────────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:alpine AS runner
# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Copy build output to nginx document root
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]
