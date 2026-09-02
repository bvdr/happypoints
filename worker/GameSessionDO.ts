import { DurableObject } from 'cloudflare:workers';
import { GameState, GameStatus, SocketMessage, Player, EmojiThrow, Env, WebSocketAttachment } from './types';

// Cap for emojiThrows array to prevent unbounded memory growth
const MAX_EMOJI_THROWS = 50;
// Time to wait after last disconnect before cleaning up storage entirely
const SESSION_CLEANUP_DELAY_MS = 5 * 60 * 1000; // 5 minutes
// Time to wait before removing a disconnected player (reconnection grace period)
const PLAYER_REMOVAL_DELAY_MS = 3000;
// Accepted bounds for the host-configurable round timer, in minutes
const MIN_ROUND_TIMER_MINUTES = 1;
const MAX_ROUND_TIMER_MINUTES = 30;

const DEFAULT_GAME_STATE: GameState = {
  sessionId: '',
  status: GameStatus.VOTING,
  players: [],
  average: null,
  aiSummary: null,
  emojiThrows: [],
  poopDisabled: false,
  roundDeadline: null,
};

/**
 * GameSessionDO - Durable Object that manages a single game session.
 *
 * Uses the WebSocket Hibernation API so the DO sleeps between messages
 * and only bills for actual computation time (instead of wall-clock duration).
 *
 * State is persisted to ctx.storage so it survives hibernation cycles.
 * Session cleanup is handled via alarms — 3s delay for player removal,
 * 5min delay for full session cleanup after everyone disconnects.
 */
export class GameSessionDO extends DurableObject<Env> {
  private gameState: GameState = { ...DEFAULT_GAME_STATE };

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Load persisted game state from storage on wake (survives hibernation)
    ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<GameState>('gameState');
      if (stored) {
        this.gameState = stored;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const sessionId = url.pathname.split('/').pop() || '';

    if (!this.gameState.sessionId) {
      this.gameState.sessionId = sessionId;
      await this.persistState();
    }

    // Upgrade to WebSocket using Hibernation API
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // acceptWebSocket makes the connection hibernatable — the DO can sleep
      // between messages instead of staying alive for the full connection duration
      this.ctx.acceptWebSocket(server);

      // Store empty attachment — will be populated on JOIN message
      server.serializeAttachment({ playerId: '', playerName: '' } as WebSocketAttachment);

      // Send current state to newly connected client
      this.sendToClient(server, {
        type: 'STATE_SYNC',
        payload: this.gameState,
        serverNow: Date.now(),
      });

      return new Response(null, {
        status: 101,
        webSocket: client,
      });
    }

    // HTTP endpoint to get current game state
    if (request.method === 'GET') {
      return new Response(JSON.stringify(this.gameState), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Reset endpoint — clears all state and disconnects all WebSockets.
    // Used for test cleanup and admin session reset.
    if (request.method === 'DELETE') {
      for (const ws of this.ctx.getWebSockets()) {
        try { ws.close(1000, 'session reset'); } catch { /* already closed */ }
      }
      this.gameState = { ...DEFAULT_GAME_STATE, emojiThrows: [], players: [] };
      await this.ctx.storage.delete('pendingRemovals');
      await this.ctx.storage.deleteAlarm();
      await this.persistState();
      return new Response('OK', { status: 200 });
    }

    return new Response('Expected WebSocket', { status: 400 });
  }

  /**
   * Hibernation handler — called by the runtime when a WebSocket message arrives.
   * The DO may have been evicted and reconstructed since the last message.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    try {
      const msg: SocketMessage = JSON.parse(message as string);
      await this.handleMessage(ws, msg);
    } catch (error) {
      console.error('Error handling message:', error);
      this.sendToClient(ws, {
        type: 'ERROR',
        payload: { message: 'Invalid message format' },
      });
    }
  }

  /**
   * Hibernation handler — called when a WebSocket connection closes.
   * Must call ws.close() to complete the close handshake.
   */
  async webSocketClose(ws: WebSocket, code: number, reason: string, wasClean: boolean): Promise<void> {
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (attachment?.playerId) {
      await this.handlePlayerDisconnect(attachment.playerId);
    }
    try { ws.close(code, reason); } catch { /* already closed */ }
  }

  /**
   * Hibernation handler — called on non-disconnection WebSocket errors.
   */
  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error('WebSocket error:', error);
    const attachment = ws.deserializeAttachment() as WebSocketAttachment | null;
    if (attachment?.playerId) {
      await this.handlePlayerDisconnect(attachment.playerId);
    }
    try { ws.close(1011, 'WebSocket error'); } catch { /* already closed */ }
  }

  /**
   * Alarm handler — processes pending player removals, round-deadline
   * auto-reveals and session cleanup.
   * Only one alarm can be active at a time, so we schedule for the earliest
   * needed time and process everything that's due when it fires.
   */
  async alarm(): Promise<void> {
    const now = Date.now();

    // 1. Process pending player removals
    const pendingRemovals = (await this.ctx.storage.get<Record<string, number>>('pendingRemovals')) || {};
    let stateChanged = false;

    for (const [playerId, removalTime] of Object.entries(pendingRemovals)) {
      if (now >= removalTime) {
        const player = this.gameState.players.find(p => p.id === playerId);
        // Only remove if still disconnected (player may have reconnected)
        if (player && player.isDisconnected) {
          const wasHost = player.isHost;
          this.gameState.players = this.gameState.players.filter(p => p.id !== playerId);

          // Promote oldest remaining player to host if the removed player was host
          if (wasHost && this.gameState.players.length > 0) {
            const sorted = [...this.gameState.players].sort((a, b) => a.joinedAt - b.joinedAt);
            sorted[0].isHost = true;
          }
          stateChanged = true;
        }
        delete pendingRemovals[playerId];
      }
    }

    // Save or clean up pending removals
    if (Object.keys(pendingRemovals).length > 0) {
      await this.ctx.storage.put('pendingRemovals', pendingRemovals);
    } else {
      await this.ctx.storage.delete('pendingRemovals');
    }

    if (stateChanged) {
      await this.persistState();
      this.broadcast({ type: 'STATE_SYNC', payload: this.gameState, serverNow: Date.now() });
    }

    // 2. Auto-reveal if the round deadline has passed
    if (
      this.gameState.status === GameStatus.VOTING &&
      typeof this.gameState.roundDeadline === 'number' &&
      now >= this.gameState.roundDeadline
    ) {
      await this.performReveal(null, true);
    }

    // 3. Check for full session cleanup (no connections AND no players left)
    const activeConnections = this.ctx.getWebSockets();
    if (activeConnections.length === 0 && this.gameState.players.length === 0) {
      await this.ctx.storage.deleteAll();
      return;
    }

    // 4. Schedule next alarm if needed
    await this.scheduleNextAlarm();
  }

  // ─── Message Handling ───────────────────────────────────────────────

  private async handleMessage(ws: WebSocket, message: SocketMessage): Promise<void> {
    switch (message.type) {
      case 'JOIN': {
        const player = message.payload;

        console.log('[JOIN] Player joining:', {
          playerId: player.id,
          playerName: player.name,
          clientIsHost: player.isHost,
          existingPlayersCount: this.gameState.players.length,
          existingPlayers: this.gameState.players.map(p => ({ id: p.id, name: p.name, isHost: p.isHost }))
        });

        // Store player identity on this WebSocket for disconnect handling
        ws.serializeAttachment({ playerId: player.id, playerName: player.name } as WebSocketAttachment);

        const existingPlayerIndex = this.gameState.players.findIndex(p => p.id === player.id);

        if (existingPlayerIndex !== -1) {
          // Player reconnecting — mark as not disconnected
          console.log('[JOIN] Player reconnecting, marking as not disconnected');
          this.gameState.players[existingPlayerIndex].isDisconnected = false;

          // Cancel pending removal for this player
          const pendingRemovals = (await this.ctx.storage.get<Record<string, number>>('pendingRemovals')) || {};
          if (pendingRemovals[player.id]) {
            delete pendingRemovals[player.id];
            if (Object.keys(pendingRemovals).length > 0) {
              await this.ctx.storage.put('pendingRemovals', pendingRemovals);
            } else {
              await this.ctx.storage.delete('pendingRemovals');
            }
          }

          // Cancel any session cleanup alarm since a player is back
          await this.scheduleNextAlarm();
        } else {
          // New player joining
          const hasExistingHost = this.gameState.players.some(p => p.isHost);
          const shouldBeHost = player.isHost || (!hasExistingHost && this.gameState.players.length === 0);

          console.log('[JOIN] New player logic:', {
            hasExistingHost,
            clientIsHost: player.isHost,
            shouldBeHost,
            playerCount: this.gameState.players.length
          });

          const newPlayer: Player = {
            ...player,
            isHost: shouldBeHost,
            joinedAt: Date.now(),
            isDisconnected: false,
            health: 100,
            isKnockedOut: false,
            poopHitCount: 0,
            isMonkey: false,
          };
          this.gameState.players.push(newPlayer);

          console.log('[JOIN] Player added with isHost:', shouldBeHost);
        }

        await this.persistState();
        this.broadcast(message);
        break;
      }

      case 'VOTE': {
        const { id, vote } = message.payload;
        const player = this.gameState.players.find(p => p.id === id);
        if (player) {
          player.vote = vote;
          await this.persistState();
          this.broadcast(message);
        }
        break;
      }

      case 'REVEAL': {
        await this.performReveal(message.payload.aiSummary || null);
        // Drop the now-stale round-deadline alarm
        await this.scheduleNextAlarm();
        break;
      }

      case 'RESET': {
        this.gameState.status = GameStatus.VOTING;
        this.gameState.average = null;
        this.gameState.aiSummary = null;
        this.gameState.players.forEach(p => {
          p.vote = null;
        });
        this.gameState.roundDeadline = this.nextRoundDeadline();

        await this.persistState();
        await this.scheduleNextAlarm();
        // Rebroadcasting the incoming message would not carry the new deadline
        this.broadcast({
          type: 'RESET',
          payload: { roundDeadline: this.gameState.roundDeadline, serverNow: Date.now() },
        });
        break;
      }

      case 'THROW_EMOJI': {
        const emojiThrow = message.payload;
        this.gameState.emojiThrows.push(emojiThrow);

        // Cap emojiThrows to prevent unbounded growth
        this.capEmojiThrows();

        // Track poop throws — the THROWER transforms to monkey at 5 poops thrown
        if (emojiThrow.emoji === '💩') {
          const thrower = this.gameState.players.find(p => p.id === emojiThrow.fromPlayerId);
          if (thrower) {
            thrower.poopHitCount = (thrower.poopHitCount || 0) + 1;
            if (thrower.poopHitCount >= 5 && !thrower.isMonkey) {
              thrower.isMonkey = true;
            }
          }
        }

        await this.persistState();
        this.broadcast(message);
        break;
      }

      case 'HIT_PLAYER': {
        const { throwId, playerId, damage, reset, emoji } = message.payload;

        if (reset) {
          const player = this.gameState.players.find(p => p.id === playerId);
          if (player) {
            player.health = 100;
            player.isKnockedOut = false;
          }
        } else if (damage) {
          const player = this.gameState.players.find(p => p.id === playerId);
          if (player) {
            if (emoji === '❤️') {
              // Hearts heal instead of damage
              player.health = Math.min(100, player.health + damage);
              player.lastHitTimestamp = Date.now();

              // Track heart hits on monkeys — revert to normal avatar at 5 hearts
              if (player.isMonkey) {
                player.heartHitCount = (player.heartHitCount || 0) + 1;
                if (player.heartHitCount >= 5) {
                  player.isMonkey = false;
                  player.poopHitCount = 0;
                  player.heartHitCount = 0;
                }
              }
            } else {
              // Apply damage for non-heart emojis
              player.health = Math.max(0, player.health - damage);
              player.isKnockedOut = player.health === 0;
              player.lastHitTimestamp = Date.now();
            }
          }
        }

        // Remove only the specific emoji throw by ID
        if (throwId) {
          this.gameState.emojiThrows = this.gameState.emojiThrows.filter(
            t => t.id !== throwId
          );
        }

        await this.persistState();
        this.broadcast(message);
        break;
      }

      case 'AI_SUMMARY': {
        this.gameState.aiSummary = message.payload.aiSummary;
        await this.persistState();
        this.broadcast(message);
        break;
      }

      case 'TOGGLE_POOP': {
        this.gameState.poopDisabled = message.payload.disabled;
        await this.persistState();
        this.broadcast(message);
        break;
      }

      case 'SET_ROUND_TIMER': {
        const { enabled, minutes } = message.payload;

        // Ignore invalid durations — no server-side authorization exists for any
        // message type here, but a bad number would corrupt the alarm schedule
        if (
          typeof minutes !== 'number' ||
          !Number.isFinite(minutes) ||
          minutes < MIN_ROUND_TIMER_MINUTES ||
          minutes > MAX_ROUND_TIMER_MINUTES
        ) {
          break;
        }

        this.gameState.roundTimer = { enabled: !!enabled, minutes };
        // Only a live voting round carries a deadline. Enabling (or changing the
        // duration while enabled) restarts it from now; disabling clears it.
        this.gameState.roundDeadline =
          this.gameState.status === GameStatus.VOTING ? this.nextRoundDeadline() : null;

        await this.persistState();
        await this.scheduleNextAlarm();
        this.broadcast({
          type: 'SET_ROUND_TIMER',
          payload: {
            enabled: this.gameState.roundTimer.enabled,
            minutes,
            roundDeadline: this.gameState.roundDeadline,
            serverNow: Date.now(),
          },
        });
        break;
      }

      case 'SET_ADMIN': {
        const { playerId, isAdmin } = message.payload;
        const targetPlayer = this.gameState.players.find(p => p.id === playerId);
        if (targetPlayer) {
          targetPlayer.isAdmin = isAdmin;
          await this.persistState();
          this.broadcast(message);
        }
        break;
      }

      case 'LEAVE': {
        const { id } = message.payload;
        await this.handlePlayerDisconnect(id);
        this.broadcast(message);
        break;
      }
    }
  }

  // ─── Player Disconnect ─────────────────────────────────────────────

  /**
   * Marks a player as disconnected and schedules removal via alarm.
   * If the player reconnects before the alarm fires, the removal is cancelled.
   */
  private async handlePlayerDisconnect(playerId: string): Promise<void> {
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player) return;

    player.isDisconnected = true;
    await this.persistState();

    // Schedule removal after grace period
    const pendingRemovals = (await this.ctx.storage.get<Record<string, number>>('pendingRemovals')) || {};
    pendingRemovals[playerId] = Date.now() + PLAYER_REMOVAL_DELAY_MS;
    await this.ctx.storage.put('pendingRemovals', pendingRemovals);

    await this.scheduleNextAlarm();
  }

  // ─── Helpers ────────────────────────────────────────────────────────

  /**
   * Schedules the next alarm for the earliest pending event — player removal,
   * round-deadline auto-reveal, or session cleanup. Only one alarm can be
   * active at a time, so all three share this single slot.
   */
  private async scheduleNextAlarm(): Promise<void> {
    const pendingRemovals = (await this.ctx.storage.get<Record<string, number>>('pendingRemovals')) || {};
    const candidates = Object.values(pendingRemovals);

    if (this.gameState.status === GameStatus.VOTING && typeof this.gameState.roundDeadline === 'number') {
      candidates.push(this.gameState.roundDeadline);
    }

    const activeConnections = this.ctx.getWebSockets();
    if (activeConnections.length === 0 && this.gameState.players.length > 0) {
      // No connections but players still in state — schedule full session
      // cleanup after delay
      candidates.push(Date.now() + SESSION_CLEANUP_DELAY_MS);
    }

    if (candidates.length > 0) {
      await this.ctx.storage.setAlarm(Math.min(...candidates));
    } else if (activeConnections.length > 0) {
      // Active connections and nothing pending — no alarm needed
      await this.ctx.storage.deleteAlarm();
    }
  }

  /** Deadline for a round starting now, or null when the timer is off. */
  private nextRoundDeadline(): number | null {
    const timer = this.gameState.roundTimer;
    if (!timer?.enabled) return null;
    return Date.now() + timer.minutes * 60_000;
  }

  /**
   * Computes the average server-side, flips to REVEALED, clears any round
   * deadline, then persists and broadcasts. Shared by the manual REVEAL
   * message and the round-deadline alarm so both behave identically.
   *
   * `autoRevealed` is set only by the alarm path. It is a per-message fact,
   * not persisted state: it tells clients this round had no revealing client,
   * so nobody has fetched the AI summary yet.
   */
  private async performReveal(aiSummary: string | null, autoRevealed = false): Promise<void> {
    let sum = 0;
    let count = 0;

    this.gameState.players.forEach(p => {
      if (p.vote && p.vote !== '?' && p.vote !== '☕') {
        const val = parseInt(p.vote);
        if (!isNaN(val)) {
          sum += val;
          count++;
        }
      }
    });

    const average = count > 0 ? parseFloat((sum / count).toFixed(2)) : 0;

    this.gameState.status = GameStatus.REVEALED;
    this.gameState.average = average;
    this.gameState.aiSummary = aiSummary;
    // A revealed round has no deadline
    this.gameState.roundDeadline = null;

    await this.persistState();
    this.broadcast({
      type: 'REVEAL',
      payload: {
        status: GameStatus.REVEALED,
        average,
        aiSummary: this.gameState.aiSummary,
        autoRevealed,
      },
    });
  }

  private async persistState(): Promise<void> {
    await this.ctx.storage.put('gameState', this.gameState);
  }

  /**
   * Cap emojiThrows to MAX_EMOJI_THROWS, removing oldest entries.
   */
  private capEmojiThrows(): void {
    if (this.gameState.emojiThrows.length > MAX_EMOJI_THROWS) {
      this.gameState.emojiThrows = this.gameState.emojiThrows.slice(-MAX_EMOJI_THROWS);
    }
  }

  private broadcast(message: SocketMessage): void {
    const payload = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(payload);
      } catch (error) {
        console.error('Error sending message to client:', error);
      }
    }
  }

  private sendToClient(websocket: WebSocket, message: SocketMessage): void {
    try {
      websocket.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending message to client:', error);
    }
  }
}
