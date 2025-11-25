# High Stakes Planning Poker 🏐

A real-time, multiplayer planning poker app powered by Cloudflare Workers + Durable Objects.

## Features

- ✅ Real-time multiplayer across devices (via WebSockets)
- ✅ 3D poker table with animated cards
- ✅ Emoji throwing mini-game between players
- ✅ AI-powered vote summaries (Gemini)
- ✅ Automatic vote reveal after all players vote
- ✅ Host controls for revealing and resetting rounds
- ✅ No database needed - state managed by Durable Objects

## Tech Stack

### Frontend
- React 19
- Three.js + React Three Fiber
- Vite
- Tailwind CSS
- TypeScript

### Backend
- Cloudflare Workers
- Durable Objects (WebSocket state management)
- WebSocket API

## Local Development

### Prerequisites

- Node.js 18+
- npm or yarn
- Cloudflare account (for deployment)

### Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create environment file:**
   ```bash
   cp .env.example .env
   ```

3. **Add your Gemini API key to `.env`:**
   ```env
   VITE_GEMINI_API_KEY=your_key_here
   ```

### Run Development Servers

**Option 1: Run both servers together (recommended)**
```bash
npm run dev:all
```

This starts:
- Frontend: `http://localhost:3000`
- Worker: `http://localhost:8787`

**Option 2: Run separately**

Terminal 1 - Frontend:
```bash
npm run dev
```

Terminal 2 - Worker:
```bash
npm run dev:worker
```

### Testing Locally

1. Open `http://localhost:3000`
2. Create a game session
3. Copy the session URL
4. Open in another browser/device
5. Both clients should sync in real-time via WebSocket

## Architecture

### How It Works

```
┌─────────────┐      WebSocket      ┌──────────────┐
│   Browser   │◄──────────────────►│   Worker     │
│  (React)    │                     │              │
└─────────────┘                     └──────┬───────┘
                                           │
┌─────────────┐      WebSocket      ┌──────▼───────┐
│   Browser   │◄──────────────────►│   Durable    │
│  (React)    │                     │   Object     │
└─────────────┘                     └──────────────┘
```

1. **Session Creation**: Client generates 6-char session ID
2. **WebSocket Connection**: Client connects to Worker at `/ws/:sessionId`
3. **Durable Object**: Worker routes connection to session-specific DO
4. **State Management**: DO holds game state in memory, broadcasts to all clients
5. **Real-time Sync**: All actions broadcast immediately to connected clients

### Key Files

- `services/websocketService.ts` - WebSocket client
- `worker/index.ts` - Worker routing
- `worker/GameSessionDO.ts` - Durable Object (session state)
- `App.tsx` - Main React component
- `wrangler.toml` - Worker configuration

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for full deployment guide.

### Quick Deploy

1. **Login to Cloudflare:**
   ```bash
   wrangler login
   ```

2. **Deploy Worker:**
   ```bash
   npm run deploy
   ```

3. **Deploy Pages:**
   ```bash
   npm run deploy:pages
   ```

4. **Update environment variables** in Cloudflare dashboard

## Environment Variables

### Development (`.env`)
```env
VITE_GEMINI_API_KEY=your_gemini_api_key
```

### Production (Cloudflare Pages Dashboard)
```env
VITE_GEMINI_API_KEY=your_gemini_api_key
VITE_WORKER_URL=your-worker.workers.dev
```

## Project Structure

```
planning-poker/
├── worker/                 # Cloudflare Worker code
│   ├── index.ts           # Worker entry point
│   ├── GameSessionDO.ts   # Durable Object class
│   └── types.ts           # Shared types
├── services/              # React services
│   ├── websocketService.ts # WebSocket client
│   └── geminiService.ts    # AI summaries
├── components/            # React components
│   ├── Table3D.tsx        # 3D poker table
│   └── UIOverlay.tsx      # 2D UI layer
├── App.tsx                # Main component
├── wrangler.toml          # Worker config
└── vite.config.ts         # Vite config
```

## Game Features

### Voting
- Click a card to vote
- Host can reveal votes manually or wait for auto-reveal (5s after all vote)
- Average is calculated from numeric votes

### Emoji Throwing
- Click player avatars to throw emojis
- Hit players lose health
- Knocked-out players respawn after 3 seconds

### Host Controls
- First player in session becomes host
- Host can reveal votes and reset rounds
- Host role transfers to next player if host leaves

## Costs

Using Cloudflare free tier:
- **Workers**: 100k requests/day
- **Durable Objects**: 1M requests/month
- **Pages**: 500 builds/month

Should be more than enough for moderate usage.

## Development Tips

### Watch Worker Logs
```bash
wrangler tail
```

### Test WebSocket Connection
```bash
curl -i -N \
  -H "Connection: Upgrade" \
  -H "Upgrade: websocket" \
  -H "Sec-WebSocket-Version: 13" \
  -H "Sec-WebSocket-Key: test" \
  http://localhost:8787/ws/ABC123
```

### Debug Durable Object State
The DO has an HTTP endpoint:
```bash
curl http://localhost:8787/api/session/ABC123
```

## Troubleshooting

### WebSocket won't connect
- Check Worker is running: `http://localhost:8787/health`
- Check browser console for errors
- Verify CORS settings in `wrangler.toml`

### Durable Object errors
- Ensure you've run `wrangler dev` at least once
- Check bindings in `wrangler.toml`
- Verify DO is declared in migrations

### Vite build errors
- Clear cache: `rm -rf node_modules/.vite`
- Reinstall: `npm install`

## Contributing

Pull requests welcome! Please ensure:
- TypeScript types are correct
- Code follows existing patterns
- No console.logs in production code

## License

MIT
