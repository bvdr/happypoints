// Shared types between Worker and Durable Object
export interface Player {
  id: string;
  name: string;
  isHost: boolean;
  isAdmin?: boolean; // Admins can reveal/reset and manage other users
  vote: string | null;
  joinedAt: number;
  isDisconnected: boolean;
  health: number;
  isKnockedOut: boolean;
  lastHitTimestamp?: number;
  poopHitCount?: number; // Count of poop emoji throws - thrower transforms to monkey at 5
  isMonkey?: boolean; // True when player has thrown 5 poops, transforms avatar to monkey
  heartHitCount?: number; // Count of heart emoji hits received while monkey - reverts at 5
}

export interface EmojiThrow {
  id: string;
  fromPlayerId: string;
  toPlayerId: string;
  emoji: string;
  timestamp: number;
}

export enum GameStatus {
  VOTING = 'voting',
  REVEALED = 'revealed',
}

// Host-configurable round timer setting. Duration is in MINUTES everywhere
// user-facing; the server converts to ms when computing a deadline.
export interface RoundTimerSetting {
  enabled: boolean;
  minutes: number;
}

export interface GameState {
  sessionId: string;
  status: GameStatus;
  players: Player[];
  average: number | null;
  aiSummary: string | null;
  emojiThrows: EmojiThrow[];
  poopDisabled?: boolean; // Host can disable poop emoji - shows rose instead
  roundTimer?: RoundTimerSetting; // Session setting (off by default)
  roundDeadline?: number | null; // Epoch ms when the current round auto-reveals
}

// WebSocket message types
export type SocketMessage =
  | { type: 'JOIN'; payload: Player }
  | { type: 'VOTE'; payload: { id: string; vote: string | null } }
  | {
      type: 'REVEAL';
      payload: {
        status: GameStatus;
        average: number | null;
        aiSummary: string | null;
        // True only for a deadline auto-reveal, which has no originating
        // client — tells the host it owns the AI summary fetch for this round
        autoRevealed?: boolean;
      };
    }
  | { type: 'AI_SUMMARY'; payload: { aiSummary: string } }
  | { type: 'RESET'; payload: { roundDeadline?: number | null; serverNow?: number } | null }
  | { type: 'LEAVE'; payload: { id: string } }
  | { type: 'THROW_EMOJI'; payload: EmojiThrow }
  | { type: 'HIT_PLAYER'; payload: { throwId?: string; playerId: string; damage?: number; timestamp?: number; reset?: boolean; emoji?: string } }
  | { type: 'TOGGLE_POOP'; payload: { disabled: boolean } }
  | { type: 'SET_ROUND_TIMER'; payload: RoundTimerSetting & { roundDeadline?: number | null; serverNow?: number } }
  | { type: 'SET_ADMIN'; payload: { playerId: string; isAdmin: boolean } }
  | { type: 'STATE_SYNC'; payload: GameState; serverNow?: number }
  | { type: 'ERROR'; payload: { message: string } };

// Per-connection metadata stored via ws.serializeAttachment/deserializeAttachment
// Survives hibernation cycles without needing an in-memory Map
export interface WebSocketAttachment {
  playerId: string;
  playerName: string;
}

export interface Env {
  GAME_SESSION: DurableObjectNamespace;
  CORS_ORIGIN?: string;
  GEMINI_API_KEY?: string;
}
