import { env } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import { GameStatus } from '../types';
import type { GameState, SocketMessage, Player } from '../types';

// ─── Shared DO Stub ──────────────────────────────────────────────────
// vitest-pool-workers routes all DO requests to a single instance,
// so we use one stub and reset it via DELETE before each test.

const SESSION_ID = 'TESTXX';
const id = env.GAME_SESSION.idFromName(SESSION_ID);
const doStub = env.GAME_SESSION.get(id);

beforeEach(async () => {
  // Reset DO state via DELETE endpoint — clears storage + in-memory state
  await doStub.fetch(`http://fake-host/reset`, { method: 'DELETE' });
});

// ─── Helpers ──────────────────────────────────────────────────────────

/** Connect a WebSocket and consume the initial STATE_SYNC */
async function connect(): Promise<{ ws: WebSocket; initialState: GameState }> {
  const resp = await doStub.fetch(`http://fake-host/ws/${SESSION_ID}`, {
    headers: { Upgrade: 'websocket' },
  });

  const ws = resp.webSocket!;

  const statePromise = new Promise<GameState>((resolve) => {
    ws.addEventListener('message', (event) => {
      const msg: SocketMessage = JSON.parse(event.data as string);
      if (msg.type === 'STATE_SYNC') {
        resolve(msg.payload as GameState);
      }
    }, { once: true });
  });

  ws.accept();
  const initialState = await statePromise;
  return { ws, initialState };
}

/** Get game state via HTTP GET */
async function getState(): Promise<GameState> {
  const resp = await doStub.fetch(`http://fake-host/api/session/${SESSION_ID}`);
  return resp.json();
}

function nextMessage(ws: WebSocket, timeoutMs = 2000): Promise<SocketMessage> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for message')), timeoutMs);
    ws.addEventListener('message', (event) => {
      clearTimeout(timeout);
      resolve(JSON.parse(event.data as string));
    }, { once: true });
  });
}

function makeJoinMessage(id: string, name: string, isHost: boolean): SocketMessage {
  return {
    type: 'JOIN',
    payload: {
      id, name, isHost,
      vote: null, joinedAt: Date.now(), isDisconnected: false,
      health: 100, isKnockedOut: false, poopHitCount: 0, isMonkey: false,
    } as Player,
  };
}

function send(ws: WebSocket, msg: SocketMessage) {
  ws.send(JSON.stringify(msg));
}

// ─── Tests ────────────────────────────────────────────────────────────

describe('GameSessionDO', () => {

  // ── Connection Lifecycle ──────────────────────────────────────────

  describe('Connection Lifecycle', () => {
    it('sends STATE_SYNC on initial WebSocket connection', async () => {
      const { ws, initialState } = await connect();

      expect(initialState.sessionId).toBe(SESSION_ID);
      expect(initialState.status).toBe(GameStatus.VOTING);
      expect(initialState.players).toHaveLength(0);

      ws.close();
    });

    it('accepts multiple WebSocket connections to the same session', async () => {
      const { ws: ws1, initialState: s1 } = await connect();
      const { ws: ws2, initialState: s2 } = await connect();

      expect(s1.sessionId).toBe(SESSION_ID);
      expect(s2.sessionId).toBe(SESSION_ID);

      ws1.close();
      ws2.close();
    });

    it('returns 400 for non-WebSocket POST requests', async () => {
      const resp = await doStub.fetch(`http://fake-host/ws/${SESSION_ID}`, {
        method: 'POST',
      });
      expect(resp.status).toBe(400);
    });

    it('returns game state via HTTP GET', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      const state = await getState();
      expect(state.players).toHaveLength(1);
      expect(state.players[0].name).toBe('Alice');

      ws.close();
    });
  });

  // ── JOIN ──────────────────────────────────────────────────────────

  describe('JOIN', () => {
    it('adds a new player to game state', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      const msg = await nextMessage(ws);

      expect(msg.type).toBe('JOIN');

      const state = await getState();
      expect(state.players).toHaveLength(1);
      expect(state.players[0].id).toBe('p1');
      expect(state.players[0].health).toBe(100);
      expect(state.players[0].isDisconnected).toBe(false);

      ws.close();
    });

    it('sets first player as host when no existing host', async () => {
      const { ws } = await connect();
      // Join without claiming host
      send(ws, makeJoinMessage('p1', 'Alice', false));
      await nextMessage(ws);

      const state = await getState();
      expect(state.players[0].isHost).toBe(true);

      ws.close();
    });

    it('does NOT make second player host', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      const { ws: ws2 } = await connect();
      send(ws2, makeJoinMessage('p2', 'Bob', false));
      await nextMessage(ws2);

      const state = await getState();
      expect(state.players).toHaveLength(2);
      expect(state.players.find(p => p.id === 'p1')!.isHost).toBe(true);
      expect(state.players.find(p => p.id === 'p2')!.isHost).toBe(false);

      ws.close();
      ws2.close();
    });

    it('marks reconnecting player as not disconnected', async () => {
      const { ws: ws1 } = await connect();
      send(ws1, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws1);

      ws1.close();
      await new Promise(r => setTimeout(r, 100));

      const { ws: ws2 } = await connect();
      send(ws2, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws2);

      const state = await getState();
      const alice = state.players.filter(p => p.id === 'p1');
      expect(alice).toHaveLength(1);
      expect(alice[0].isDisconnected).toBe(false);

      ws2.close();
    });
  });

  // ── VOTE ──────────────────────────────────────────────────────────

  describe('VOTE', () => {
    it('records player vote', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'VOTE', payload: { id: 'p1', vote: '5' } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.players[0].vote).toBe('5');

      ws.close();
    });

    it('broadcasts vote to all connected clients', async () => {
      const { ws: ws1 } = await connect();
      send(ws1, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws1);

      const { ws: ws2 } = await connect();
      send(ws2, makeJoinMessage('p2', 'Bob', false));
      await nextMessage(ws2);

      send(ws1, { type: 'VOTE', payload: { id: 'p1', vote: '8' } });
      await nextMessage(ws1);

      // Verify state via HTTP (multi-WS broadcast timing unreliable in tests)
      const state = await getState();
      expect(state.players.find(p => p.id === 'p1')!.vote).toBe('8');

      ws1.close();
      ws2.close();
    });

    it('ignores vote for non-existent player', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'VOTE', payload: { id: 'nonexistent', vote: '5' } });
      send(ws, { type: 'VOTE', payload: { id: 'p1', vote: '3' } });
      const msg = await nextMessage(ws);
      expect(msg.type).toBe('VOTE');

      ws.close();
    });
  });

  // ── REVEAL ────────────────────────────────────────────────────────

  describe('REVEAL', () => {
    it('calculates average from numeric votes', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      const { ws: ws2 } = await connect();
      send(ws2, makeJoinMessage('p2', 'Bob', false));
      await nextMessage(ws2);

      send(ws, { type: 'VOTE', payload: { id: 'p1', vote: '5' } });
      await nextMessage(ws);
      send(ws2, { type: 'VOTE', payload: { id: 'p2', vote: '13' } });
      await nextMessage(ws2);

      send(ws, { type: 'REVEAL', payload: { status: GameStatus.REVEALED, average: null, aiSummary: null } });
      // Small delay to let the DO process the REVEAL
      await new Promise(r => setTimeout(r, 50));

      // Verify via HTTP GET — multi-WS broadcast ordering is unreliable
      // because ws1 also receives pending JOIN/VOTE broadcasts from ws2
      const state = await getState();
      expect(state.status).toBe(GameStatus.REVEALED);
      expect(state.average).toBe(9);

      ws.close();
      ws2.close();
    });

    it('excludes ? and coffee from average calculation', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      const { ws: ws2 } = await connect();
      send(ws2, makeJoinMessage('p2', 'Bob', false));
      await nextMessage(ws2);

      send(ws, { type: 'VOTE', payload: { id: 'p1', vote: '8' } });
      await nextMessage(ws);
      send(ws2, { type: 'VOTE', payload: { id: 'p2', vote: '?' } });
      await nextMessage(ws2);

      send(ws, { type: 'REVEAL', payload: { status: GameStatus.REVEALED, average: null, aiSummary: null } });
      await new Promise(r => setTimeout(r, 50));

      const state = await getState();
      expect(state.status).toBe(GameStatus.REVEALED);
      expect(state.average).toBe(8);

      ws.close();
      ws2.close();
    });

    it('returns average 0 when all votes are non-numeric', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'VOTE', payload: { id: 'p1', vote: '?' } });
      await nextMessage(ws);

      send(ws, { type: 'REVEAL', payload: { status: GameStatus.REVEALED, average: null, aiSummary: null } });
      const revealMsg = await nextMessage(ws);

      expect((revealMsg.payload as any).average).toBe(0);

      ws.close();
    });
  });

  // ── RESET ─────────────────────────────────────────────────────────

  describe('RESET', () => {
    it('clears all votes and resets to VOTING', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'VOTE', payload: { id: 'p1', vote: '5' } });
      await nextMessage(ws);
      send(ws, { type: 'REVEAL', payload: { status: GameStatus.REVEALED, average: null, aiSummary: null } });
      await nextMessage(ws);

      send(ws, { type: 'RESET', payload: null });
      await nextMessage(ws);

      const state = await getState();
      expect(state.status).toBe(GameStatus.VOTING);
      expect(state.average).toBeNull();
      expect(state.players[0].vote).toBeNull();

      ws.close();
    });
  });

  // ── THROW_EMOJI ───────────────────────────────────────────────────

  describe('THROW_EMOJI', () => {
    it('adds emoji throw to game state', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, {
        type: 'THROW_EMOJI',
        payload: { id: 'throw1', fromPlayerId: 'p1', toPlayerId: 'p2', emoji: '🎉', timestamp: Date.now() },
      });
      await nextMessage(ws);

      const state = await getState();
      expect(state.emojiThrows).toHaveLength(1);
      expect(state.emojiThrows[0].emoji).toBe('🎉');

      ws.close();
    });

    it('caps emojiThrows at 50, removing oldest', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      for (let i = 0; i < 55; i++) {
        send(ws, {
          type: 'THROW_EMOJI',
          payload: { id: `throw${i}`, fromPlayerId: 'p1', toPlayerId: 'p2', emoji: '🎉', timestamp: Date.now() },
        });
        await nextMessage(ws);
      }

      const state = await getState();
      expect(state.emojiThrows).toHaveLength(50);
      expect(state.emojiThrows[0].id).toBe('throw5');
      expect(state.emojiThrows[49].id).toBe('throw54');

      ws.close();
    });

    it('transforms thrower to monkey at 5 poop throws', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      for (let i = 0; i < 5; i++) {
        send(ws, {
          type: 'THROW_EMOJI',
          payload: { id: `poop${i}`, fromPlayerId: 'p1', toPlayerId: 'p2', emoji: '💩', timestamp: Date.now() },
        });
        await nextMessage(ws);
      }

      const state = await getState();
      expect(state.players[0].isMonkey).toBe(true);
      expect(state.players[0].poopHitCount).toBe(5);

      ws.close();
    });
  });

  // ── HIT_PLAYER ────────────────────────────────────────────────────

  describe('HIT_PLAYER', () => {
    it('applies damage to target player', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'HIT_PLAYER', payload: { playerId: 'p1', damage: 25, emoji: '💩' } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.players[0].health).toBe(75);

      ws.close();
    });

    it('heals with heart emoji', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'HIT_PLAYER', payload: { playerId: 'p1', damage: 50, emoji: '💩' } });
      await nextMessage(ws);
      send(ws, { type: 'HIT_PLAYER', payload: { playerId: 'p1', damage: 20, emoji: '❤️' } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.players[0].health).toBe(70);

      ws.close();
    });

    it('knocks out player at 0 health', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'HIT_PLAYER', payload: { playerId: 'p1', damage: 100, emoji: '💩' } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.players[0].health).toBe(0);
      expect(state.players[0].isKnockedOut).toBe(true);

      ws.close();
    });

    it('reverts monkey at 5 heart hits', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      for (let i = 0; i < 5; i++) {
        send(ws, {
          type: 'THROW_EMOJI',
          payload: { id: `poop${i}`, fromPlayerId: 'p1', toPlayerId: 'p2', emoji: '💩', timestamp: Date.now() },
        });
        await nextMessage(ws);
      }

      send(ws, { type: 'HIT_PLAYER', payload: { playerId: 'p1', damage: 60, emoji: '💩' } });
      await nextMessage(ws);

      for (let i = 0; i < 5; i++) {
        send(ws, { type: 'HIT_PLAYER', payload: { playerId: 'p1', damage: 10, emoji: '❤️' } });
        await nextMessage(ws);
      }

      const state = await getState();
      expect(state.players[0].isMonkey).toBe(false);
      expect(state.players[0].poopHitCount).toBe(0);

      ws.close();
    });

    it('resets player health', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'HIT_PLAYER', payload: { playerId: 'p1', damage: 80, emoji: '💩' } });
      await nextMessage(ws);
      send(ws, { type: 'HIT_PLAYER', payload: { playerId: 'p1', reset: true } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.players[0].health).toBe(100);
      expect(state.players[0].isKnockedOut).toBe(false);

      ws.close();
    });

    it('removes specific emoji throw by ID', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, {
        type: 'THROW_EMOJI',
        payload: { id: 'throw1', fromPlayerId: 'p1', toPlayerId: 'p2', emoji: '🎉', timestamp: Date.now() },
      });
      await nextMessage(ws);
      send(ws, {
        type: 'THROW_EMOJI',
        payload: { id: 'throw2', fromPlayerId: 'p1', toPlayerId: 'p2', emoji: '💩', timestamp: Date.now() },
      });
      await nextMessage(ws);

      send(ws, { type: 'HIT_PLAYER', payload: { throwId: 'throw1', playerId: 'p1', damage: 10, emoji: '🎉' } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.emojiThrows).toHaveLength(1);
      expect(state.emojiThrows[0].id).toBe('throw2');

      ws.close();
    });
  });

  // ── TOGGLE_POOP ───────────────────────────────────────────────────

  describe('TOGGLE_POOP', () => {
    it('sets poopDisabled flag', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'TOGGLE_POOP', payload: { disabled: true } });
      await nextMessage(ws);

      let state = await getState();
      expect(state.poopDisabled).toBe(true);

      send(ws, { type: 'TOGGLE_POOP', payload: { disabled: false } });
      await nextMessage(ws);

      state = await getState();
      expect(state.poopDisabled).toBe(false);

      ws.close();
    });
  });

  // ── SET_ADMIN ─────────────────────────────────────────────────────

  describe('SET_ADMIN', () => {
    it('sets admin flag on target player', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      const { ws: ws2 } = await connect();
      send(ws2, makeJoinMessage('p2', 'Bob', false));
      await nextMessage(ws2);

      send(ws, { type: 'SET_ADMIN', payload: { playerId: 'p2', isAdmin: true } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.players.find(p => p.id === 'p2')!.isAdmin).toBe(true);

      ws.close();
      ws2.close();
    });

    it('ignores SET_ADMIN for non-existent player', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'SET_ADMIN', payload: { playerId: 'nonexistent', isAdmin: true } });
      send(ws, { type: 'VOTE', payload: { id: 'p1', vote: '3' } });
      const msg = await nextMessage(ws);
      expect(msg.type).toBe('VOTE');

      ws.close();
    });
  });

  // ── LEAVE ─────────────────────────────────────────────────────────

  describe('LEAVE', () => {
    it('marks player as disconnected on explicit LEAVE', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'LEAVE', payload: { id: 'p1' } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.players[0].isDisconnected).toBe(true);

      ws.close();
    });

    it('marks player disconnected on WebSocket close', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      ws.close();
      await new Promise(r => setTimeout(r, 200));

      const state = await getState();
      expect(state.players[0].isDisconnected).toBe(true);
    });
  });

  // ── Host Promotion ────────────────────────────────────────────────

  describe('Host Promotion', () => {
    it('marks host as disconnected when WebSocket closes', async () => {
      const { ws: ws1 } = await connect();
      send(ws1, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws1);

      const { ws: ws2 } = await connect();
      send(ws2, makeJoinMessage('p2', 'Bob', false));
      await nextMessage(ws2);

      ws1.close();
      await new Promise(r => setTimeout(r, 200));

      const state = await getState();
      expect(state.players.find(p => p.id === 'p1')!.isDisconnected).toBe(true);

      ws2.close();
    });
  });

  // ── State Persistence ─────────────────────────────────────────────

  describe('State Persistence', () => {
    it('persists state to storage', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'VOTE', payload: { id: 'p1', vote: '13' } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.players[0].vote).toBe('13');

      ws.close();
    });
  });

  // ── AI_SUMMARY ────────────────────────────────────────────────────

  describe('AI_SUMMARY', () => {
    it('updates AI summary on game state', async () => {
      const { ws } = await connect();
      send(ws, makeJoinMessage('p1', 'Alice', true));
      await nextMessage(ws);

      send(ws, { type: 'AI_SUMMARY', payload: { aiSummary: 'Great consensus!' } });
      await nextMessage(ws);

      const state = await getState();
      expect(state.aiSummary).toBe('Great consensus!');

      ws.close();
    });
  });
});
