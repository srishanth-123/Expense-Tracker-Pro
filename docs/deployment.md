# Deployment Guide

This guide walks you through deploying the Expense Tracker Pro application to production.

## 1. Prerequisites & Services

Before deploying, create accounts and instances on:
* **MongoDB Atlas**: Free Shared Cluster for the database.
* **Upstash**: Serverless Redis database (copy the REST credentials and the Rediss TCP connection string).
* **Render**: For backend Web Service hosting.
* **Vercel**: For frontend React SPA static hosting.

---

## 2. Database & Cache Configuration

1. **MongoDB Atlas**:
   - Create a database and database user.
   - Whitelist connections from `0.0.0.0/27` (or specific IPs of Render and your local environment).
   - Copy the MongoDB connection URI.

2. **Upstash Redis**:
   - Create a Redis Database.
   - Under the Dashboard, copy:
     - `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
     - `rediss://...` TCP URL for `ioredis` (BullMQ and Socket.io).

---

## 3. Backend Deployment (Render)

We have provided a Render blueprint specification (`render.yaml`) to automate the backend setup.

1. Connect your repository to Render.
2. Render will automatically detect the `render.yaml` blueprint.
3. Fill in the environment variables requested in the Render dashboard:
   - `MONGO_URI`
   - `FRONTEND_URL` (your Vercel URL once deployed)
   - `REDIS_URL`
   - `REDIS_TOKEN`
   - `REDIS_IOREDIS_URL`
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RESEND_API_KEY` (optional, for email notifications)

---

## 4. Frontend Deployment (Vercel)

The frontend is fully Vercel-ready.

1. Create a new project in Vercel and connect your Git repository.
2. Select the `frontend` folder as the Root Directory.
3. Configure settings:
   - **Framework Preset**: `Vite` (Vercel auto-detects this).
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. Add the Environment Variable:
   - `VITE_API_URL`: `https://your-render-backend-url.onrender.com/api`
5. Click **Deploy**. Vercel will build the React SPA and serve it, routing requests properly via `vercel.json` rewrites.
