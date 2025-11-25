# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

High Stakes Planning Poker is a **serverless, local-first** planning poker application for agile estimation. It uses `BroadcastChannel` API for real-time cross-tab synchronization and `localStorage` for state persistence—no backend server required.

## Development Commands

```bash
# Start development server (runs on port 3000)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Architecture & Key Concepts

### Serverless Multiplayer Architecture

This project does NOT use traditional WebSockets or a backend server. Instead:

- **`services/mockSocketService.ts`**: The core orchestrator that simulates WebSocket behavior
  - Uses `BroadcastChannel` API to sync state across browser tabs in real-time
  - Persists game state to `localStorage` under key `poker_state_{sessionId}`
  - All game actions (join, vote, reveal, reset) flow through this service

- **Cross-Tab Communication**: When one tab changes state (e.g., votes), it broadcasts via `BroadcastChannel`, all other tabs receive the update and re-render

- **State Recovery**: On page refresh or new tab joining existing session, state is loaded from `localStorage`

### Session & Player Management

- **Session ID**: Generated client-side (6-character uppercase string) and stored in URL hash (`#ABCDEF`)
- **Host Logic**: First player to create a session becomes host (has reveal/reset controls)
  - Host determination happens in `App.tsx` based on whether session ID was generated or joined
  - In a real implementation, backend would manage this

- **Player Identity**: Each player gets unique ID, name, and avatar (using DiceBear API)

### State Flow

1. User joins via `LandingScreen` → creates/joins session
2. `App.tsx` initializes `Player` object and passes to `GameScreen`
3. `GameScreen` connects to `mockSocketService` with session ID
4. Service checks `localStorage` for existing state or initializes new game
5. All state changes broadcast to other tabs via `BroadcastChannel`
6. React components subscribe to state updates and re-render

### File Structure

```
/
├── App.tsx                        # Root component, routing logic, session/player initialization
├── screens/
│   ├── LandingScreen.tsx          # Entry point: join/create session form
│   └── GameScreen.tsx             # Main game UI: player seats, voting cards, host controls
├── services/
│   └── mockSocketService.ts       # Core state management & cross-tab sync
├── components/
│   ├── Avatar.tsx                 # Player avatar display
│   ├── Button.tsx                 # Reusable button component
│   └── PlayingCard.tsx            # Animated voting card component
├── types.ts                       # TypeScript interfaces (GameState, Player, CardValue, etc.)
├── constants.ts                   # Static config (FIBONACCI_DECK, SEAT_POSITIONS)
└── vite.config.ts                 # Vite config with alias @ → root, port 3000
```

### Type System (types.ts)

- **`CardValue`**: `'0' | '1' | '2' | '3' | '5' | '8' | '13' | '21' | '?' | 'Joker'`
- **`Player`**: `{ id, name, avatarUrl, isHost }`
- **`GameState`**: `{ sessionId, players[], votes{}, status: 'voting'|'revealed', average? }`
- **`GameAction`**: Action types for state mutations (`JOIN`, `VOTE`, `REVEAL`, `RESET`, `LEAVE`)

### Key Implementation Details

- **Path Alias**: `@/` maps to project root (configured in vite.config.ts and tsconfig.json)
- **Animations**: Framer Motion used throughout for card flips, player joins, reveals
- **Icons**: Lucide React for UI icons
- **Styling**: CSS Modules or inline styles (check individual components)
- **Environment Variables**: Vite exposes `GEMINI_API_KEY` via `process.env` (for future AI features)

### Average Calculation

When cards are revealed (`services/mockSocketService.ts:118-140`):
- Numeric values are summed and averaged
- Non-numeric values (`?`, `Joker`) are excluded from calculation
- Result displayed in `GameScreen` after reveal

### Testing Multiplayer Locally

Open `http://localhost:3000` in **multiple browser tabs or windows**. Each tab acts as a different player. State syncs in real-time across all tabs via `BroadcastChannel`.

## Common Development Patterns

### Adding a New Card Deck

1. Define new `CardValue` type in `types.ts`
2. Add deck to `constants.ts` (e.g., `T_SHIRT_DECK`)
3. Update average calculation logic in `mockSocketService.ts` if needed
4. Update `PlayingCard.tsx` for any visual changes

### Adding New Game Actions

1. Add action type to `GameAction` interface in `types.ts`
2. Implement handler in `mockSocketService.ts`
3. Call from `GameScreen.tsx` UI
4. Broadcast state change via `broadcast()` method

### Modifying Player Seating Layout

Edit `SEAT_POSITIONS` array in `constants.ts`. Positions use percentage-based top/left for circular arrangement around virtual poker table.

## Important Constraints

- **No Server**: All logic runs client-side. Security/validation are client-side only
- **localStorage Limits**: Game state limited by browser storage quota (~5-10MB)
- **Same-Origin Only**: `BroadcastChannel` only works across tabs on same domain
- **Host Controls**: Only first player (host) can reveal cards or reset round—enforced in UI only

## React 19 Usage

This project uses React 19. Be aware of breaking changes from React 18 if referencing older documentation.
