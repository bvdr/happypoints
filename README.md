# HappyPoints

Real-time 3D planning poker for agile teams. Estimate stories together with animated card reveals, emoji battles, and AI-powered vote summaries.

**[happypoints.app](https://happypoints.app)**

## Features

- **Real-time multiplayer** via WebSockets — syncs across devices instantly
- **3D poker table** with animated card reveals (Three.js + React Three Fiber)
- **Fibonacci deck** — 1, 2, 3, 5, 8, 13, 21, ?, coffee
- **Auto-reveal** — votes flip automatically 5s after everyone votes
- **AI summaries** — Gemini generates a witty comment about the team's consensus (or lack thereof)
- **Emoji throwing** — throw emojis at teammates between rounds, complete with health bars and knockouts
- **Host controls** — reveal votes early, reset rounds, transfer host role
- **No sign-up** — share a 6-character session link and start estimating

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS |
| 3D | Three.js, React Three Fiber, Drei |
| Backend | Cloudflare Workers, Durable Objects |
| Real-time | WebSocket API |
| AI | Gemini 2.5 Flash |
| Hosting | Cloudflare Pages + Workers |
| CI/CD | GitHub Actions |

## Architecture

```
Browser (React + Three.js)
    │
    │ WebSocket
    ▼
Cloudflare Worker (api.happypoints.app)
    │
    │ Routes by session ID
    ▼
Durable Object (one per session)
    │
    │ Broadcasts state changes
    ▼
All connected browsers
```

Each session gets its own Durable Object instance. State lives in memory — no database needed.

## Local Development

### Prerequisites

- Node.js 20+
- npm
- Cloudflare account (free tier, for Worker dev server)

### Setup

```bash
# Install dependencies
npm install

# Create env file
cp .env.example .env
```

Edit `.env` and add your [Gemini API key](https://aistudio.google.com/apikey) (optional — app works without it, just no AI summaries):

```env
VITE_GEMINI_API_KEY=your_key_here
```

### Run

```bash
npm run dev:all
```

This starts both servers concurrently:
- **Frontend**: http://localhost:3000
- **Worker**: http://localhost:8787

Open multiple tabs to simulate multiple players.

### Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Frontend only (Vite, port 3000) |
| `npm run dev:worker` | Worker only (Wrangler, port 8787) |
| `npm run dev:all` | Both servers concurrently |
| `npm run build` | Build frontend to `dist/` |
| `npm run build:worker` | Compile worker TypeScript |
| `npm run deploy` | Deploy worker to Cloudflare |
| `npm run deploy:pages` | Deploy frontend to Cloudflare Pages |

## Deployment

Deployments are automated via GitHub Actions. Every push to `main` triggers a full deploy.

### What happens on push

1. Installs dependencies
2. Builds frontend (`npm run build`)
3. Builds worker (`npm run build:worker`)
4. Deploys Worker to Cloudflare (handles WebSocket connections)
5. Deploys Pages to Cloudflare (serves the frontend)

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID |
| `CLOUDFLARE_API_TOKEN` | API token with Workers + Pages permissions |

### Manual Deploy

```bash
wrangler login
npm run deploy          # Worker
npm run deploy:pages    # Frontend
```

### Environment Variables (Production)

Set these in the Cloudflare Pages dashboard:

| Variable | Description |
|----------|-------------|
| `VITE_GEMINI_API_KEY` | Gemini API key for AI summaries |
| `VITE_WORKER_URL` | Worker URL (e.g., `api.happypoints.app`) |

### Custom Domain

The worker is configured for `api.happypoints.app` in `wrangler.toml`. To use a different domain, update the `routes` section and the `CORS_ORIGIN` values.

## Project Structure

```
happypoints/
├── App.tsx                    # Entry — session routing, player setup, landing screen
├── types.ts                   # Shared types (Player, GameState, CardValue, etc.)
├── constants.ts               # Fibonacci deck, table colors, dimensions
├── worker/
│   ├── index.ts               # Worker entry — routes WebSocket, health, API
│   └── GameSessionDO.ts       # Durable Object — session state + broadcast
├── services/
│   ├── websocketService.ts    # useGameSession hook — WebSocket client + game logic
│   └── geminiService.ts       # AI vote summary via worker API
├── components/
│   ├── Table3D.tsx            # 3D poker table, player seats, camera
│   ├── UIOverlay.tsx          # 2D overlay — card deck, controls, summary
│   ├── EmojiThrow.tsx         # Animated emoji projectile
│   ├── LifeBar.tsx            # Player health bar
│   ├── WeaponSelector.tsx     # Emoji picker
│   └── SettingsPanel.tsx      # Host settings
├── wrangler.toml              # Cloudflare Worker config
├── vite.config.ts             # Vite config (port 3000, @ alias)
└── .github/workflows/
    └── deploy.yml             # CI/CD — auto-deploy on push to main
```

## How It Works

1. A player creates a session (generates a 6-character ID)
2. Other players join via the shared link
3. Everyone connects via WebSocket to the same Durable Object
4. Players pick cards — votes are hidden until revealed
5. After all votes are in, cards auto-reveal after 5 seconds (or the host reveals early)
6. Gemini generates a summary of the voting consensus
7. Host resets the round for the next story
8. Between rounds, throw emojis at each other for fun

## Costs

Runs entirely on Cloudflare's free tier:

| Resource | Free Limit |
|----------|-----------|
| Workers | 100k requests/day |
| Durable Objects | 1M requests/month |
| Pages | 500 builds/month |

## License

MIT
