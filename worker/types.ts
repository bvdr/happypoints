// Shared types between Worker and Durable Object
export interface Player {
  id: string;
  name: string;
  isHost: boolean;
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

export interface GameState {
  sessionId: string;
  status: GameStatus;
  players: Player[];
  average: number | null;
  aiSummary: string | null;
  emojiThrows: EmojiThrow[];
  poopDisabled?: boolean; // Host can disable poop emoji - shows rose instead
}

// WebSocket message types
export type SocketMessage =
  | { type: 'JOIN'; payload: Player }
  | { type: 'VOTE'; payload: { id: string; vote: string | null } }
  | { type: 'REVEAL'; payload: { status: GameStatus; average: number | null; aiSummary: string | null } }
  | { type: 'AI_SUMMARY'; payload: { aiSummary: string } }
  | { type: 'RESET'; payload: null }
  | { type: 'LEAVE'; payload: { id: string } }
  | { type: 'THROW_EMOJI'; payload: EmojiThrow }
  | { type: 'HIT_PLAYER'; payload: { throwId?: string; playerId: string; damage?: number; timestamp?: number; reset?: boolean; emoji?: string } }
  | { type: 'TOGGLE_POOP'; payload: { disabled: boolean } }
  | { type: 'STATE_SYNC'; payload: GameState }
  | { type: 'ERROR'; payload: { message: string } };

export interface Env {
  GAME_SESSION: DurableObjectNamespace;
  CORS_ORIGIN?: string;
  GEMINI_API_KEY?: string;
}
