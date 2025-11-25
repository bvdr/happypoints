# Deployment Guide - Cloudflare Pages + Workers

This guide walks you through deploying the Planning Poker app to Cloudflare.

## Prerequisites

- Cloudflare account (free tier works)
- Node.js 18+ installed
- Wrangler CLI installed globally: `npm install -g wrangler`

## Architecture Overview

- **Frontend**: React app deployed to Cloudflare Pages
- **Backend**: Cloudflare Worker with Durable Objects for WebSocket connections
- **Real-time sync**: WebSocket via Worker, state managed by Durable Objects

## Step 1: Login to Cloudflare

```bash
wrangler login
```

This will open a browser for authentication.

## Step 2: Deploy the Worker (Backend)

1. Update `wrangler.toml` with your preferences:
   - Change `name` if desired (this becomes your worker subdomain)
   - Update `CORS_ORIGIN` in production vars to your Pages URL

2. Deploy the worker:

```bash
npm run deploy
```

This will:
- Build the worker
- Deploy to Cloudflare
- Create the Durable Object binding

**Note the Worker URL** from the deployment output. It will look like:
```
https://planning-poker-worker.<your-subdomain>.workers.dev
```

## Step 3: Configure Environment Variables

1. Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

2. Update `.env` with your values:

```env
VITE_GEMINI_API_KEY=your_actual_gemini_api_key
VITE_WORKER_URL=planning-poker-worker.<your-subdomain>.workers.dev
```

**Important**: Don't commit `.env` to git - it's already in `.gitignore`

## Step 4: Deploy to Cloudflare Pages

### Option A: Via Wrangler CLI (Recommended)

```bash
npm run deploy:pages
```

This will build and deploy your frontend to Cloudflare Pages.

### Option B: Via Cloudflare Dashboard (Alternative)

1. Go to Cloudflare Dashboard → Pages
2. Click "Create a project"
3. Connect your Git repository
4. Configure build settings:
   - **Framework preset**: Vite
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
5. Add environment variables:
   - `VITE_GEMINI_API_KEY`: your Gemini API key
   - `VITE_WORKER_URL`: your worker URL from Step 2

## Step 5: Update CORS Settings

After deploying Pages, you'll get a URL like:
```
https://planning-poker.pages.dev
```

Update `wrangler.toml` production CORS:

```toml
[env.production.vars]
CORS_ORIGIN = "https://your-actual-pages-url.pages.dev"
```

Redeploy the worker:

```bash
npm run deploy
```

## Step 6: Test Your Deployment

1. Visit your Pages URL
2. Create a game session
3. Open the same session in another browser/device
4. Verify real-time synchronization works

## Local Development

### Run Frontend + Worker Together

```bash
npm run dev:all
```

This runs:
- Vite dev server on `http://localhost:3000`
- Wrangler dev server on `http://localhost:8787`

The WebSocket service automatically detects localhost and connects to the local worker.

### Run Separately

Terminal 1 (Frontend):
```bash
npm run dev
```

Terminal 2 (Worker):
```bash
npm run dev:worker
```

## Troubleshooting

### WebSocket Connection Fails

- Check browser console for connection errors
- Verify Worker URL is correct in `.env`
- Check CORS settings in `wrangler.toml`
- Ensure Durable Objects are enabled in Cloudflare dashboard

### "Durable Object not found" Error

Make sure you've deployed the worker at least once to create the Durable Object binding:

```bash
wrangler deploy
```

### CORS Errors

Update `wrangler.toml` CORS_ORIGIN to match your Pages domain exactly (no trailing slash).

### Gemini AI Not Working

- Verify `VITE_GEMINI_API_KEY` is set correctly
- Check API key has Gemini API access enabled
- API calls happen client-side, so key must start with `VITE_`

## Updating the Deployment

### Update Worker

```bash
npm run deploy
```

### Update Pages

```bash
npm run deploy:pages
```

Or push to your connected Git repository if using dashboard deployment.

## Costs

- **Cloudflare Pages**: Free tier includes 500 builds/month
- **Cloudflare Workers**: Free tier includes 100,000 requests/day
- **Durable Objects**: Free tier includes 1M requests/month, 400k GB-seconds compute

This app should run comfortably within free tier limits for small-to-medium usage.

## Custom Domain (Optional)

1. In Cloudflare Dashboard → Pages → Your Project → Custom domains
2. Add your domain
3. Update DNS records as instructed
4. Update `VITE_WORKER_URL` and redeploy if needed
5. Update `CORS_ORIGIN` in `wrangler.toml` and redeploy worker

## Security Notes

- WebSocket connections are scoped by session ID
- Each session gets isolated Durable Object instance
- No authentication/authorization implemented (anyone with session URL can join)
- For production use, consider adding:
  - Session passwords
  - Rate limiting
  - User authentication
