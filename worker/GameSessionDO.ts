import { GameState, GameStatus, SocketMessage, Player, EmojiThrow } from './types';

/**
 * GameSessionDO - Durable Object that manages a single game session
 * Each session has its own instance with isolated state
 * Handles WebSocket connections and broadcasts state changes to all connected clients
 */
export class GameSessionDO {
  private state: DurableObjectState;
  private sessions: Map<WebSocket, { playerId: string; playerName: string }>;
  private gameState: GameState;

  constructor(state: DurableObjectState) {
    this.state = state;
    this.sessions = new Map();

    // Initialize default game state
    this.gameState = {
      sessionId: '',
      status: GameStatus.VOTING,
      players: [],
      average: null,
      aiSummary: null,
      emojiThrows: [],
    };
  }

  async fetch(request: Request): Promise<Response> {
    // Extract session ID from URL path
    const url = new URL(request.url);
    const sessionId = url.pathname.split('/').pop() || '';

    if (!this.gameState.sessionId) {
      this.gameState.sessionId = sessionId;
    }

    // Upgrade to WebSocket
    if (request.headers.get('Upgrade') === 'websocket') {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      await this.handleSession(server, sessionId);

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

    return new Response('Expected WebSocket', { status: 400 });
  }

  async handleSession(websocket: WebSocket, sessionId: string) {
    websocket.accept();

    // Store connection metadata
    const connectionData = { playerId: '', playerName: '' };
    this.sessions.set(websocket, connectionData);

    // Send current state to newly connected client
    this.sendToClient(websocket, {
      type: 'STATE_SYNC',
      payload: this.gameState,
    });

    websocket.addEventListener('message', async (event) => {
      try {
        const message: SocketMessage = JSON.parse(event.data as string);
        await this.handleMessage(websocket, message);
      } catch (error) {
        console.error('Error handling message:', error);
        this.sendToClient(websocket, {
          type: 'ERROR',
          payload: { message: 'Invalid message format' },
        });
      }
    });

    websocket.addEventListener('close', () => {
      const connection = this.sessions.get(websocket);
      if (connection?.playerId) {
        // Handle player disconnect
        this.handlePlayerLeave(connection.playerId);
      }
      this.sessions.delete(websocket);
    });

    websocket.addEventListener('error', () => {
      this.sessions.delete(websocket);
    });
  }

  async handleMessage(websocket: WebSocket, message: SocketMessage) {
    const connection = this.sessions.get(websocket);

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

        // Store player ID for this connection
        if (connection) {
          connection.playerId = player.id;
          connection.playerName = player.name;
        }

        // Check if player already exists
        const existingPlayerIndex = this.gameState.players.findIndex(p => p.id === player.id);

        if (existingPlayerIndex !== -1) {
          // Player reconnecting - mark as not disconnected
          console.log('[JOIN] Player reconnecting, marking as not disconnected');
          this.gameState.players[existingPlayerIndex].isDisconnected = false;
        } else {
          // New player joining
          // Respect client's isHost claim, OR fallback to making first player host
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

        this.broadcast(message);
        break;
      }

      case 'VOTE': {
        const { id, vote } = message.payload;
        const player = this.gameState.players.find(p => p.id === id);
        if (player) {
          player.vote = vote;
          this.broadcast(message);
        }
        break;
      }

      case 'REVEAL': {
        // Calculate average from votes
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
        this.gameState.aiSummary = message.payload.aiSummary || null;

        this.broadcast({
          type: 'REVEAL',
          payload: {
            status: GameStatus.REVEALED,
            average,
            aiSummary: this.gameState.aiSummary,
          },
        });
        break;
      }

      case 'RESET': {
        this.gameState.status = GameStatus.VOTING;
        this.gameState.average = null;
        this.gameState.aiSummary = null;
        this.gameState.players.forEach(p => {
          p.vote = null;
        });

        this.broadcast(message);
        break;
      }

      case 'THROW_EMOJI': {
        const emojiThrow = message.payload;
        this.gameState.emojiThrows.push(emojiThrow);

        // Track poop throws - the THROWER transforms to monkey at 5 poops thrown
        if (emojiThrow.emoji === '💩') {
          const thrower = this.gameState.players.find(p => p.id === emojiThrow.fromPlayerId);
          if (thrower) {
            thrower.poopHitCount = (thrower.poopHitCount || 0) + 1;
            if (thrower.poopHitCount >= 5 && !thrower.isMonkey) {
              thrower.isMonkey = true;
            }
          }
        }

        this.broadcast(message);
        break;
      }

      case 'HIT_PLAYER': {
        const { throwId, playerId, damage, reset } = message.payload;

        if (reset) {
          // Reset player health
          const player = this.gameState.players.find(p => p.id === playerId);
          if (player) {
            player.health = 100;
            player.isKnockedOut = false;
          }
        } else if (damage) {
          // Apply damage
          const player = this.gameState.players.find(p => p.id === playerId);
          if (player) {
            player.health = Math.max(0, player.health - damage);
            player.isKnockedOut = player.health === 0;
            player.lastHitTimestamp = Date.now();
          }
        }

        // Remove only the specific emoji throw by ID
        if (throwId) {
          this.gameState.emojiThrows = this.gameState.emojiThrows.filter(
            t => t.id !== throwId
          );
        }

        this.broadcast(message);
        break;
      }

      case 'AI_SUMMARY': {
        // Update AI summary asynchronously after reveal
        this.gameState.aiSummary = message.payload.aiSummary;
        this.broadcast(message);
        break;
      }

      case 'LEAVE': {
        const { id } = message.payload;
        this.handlePlayerLeave(id);
        this.broadcast(message);
        break;
      }
    }
  }

  handlePlayerLeave(playerId: string) {
    const player = this.gameState.players.find(p => p.id === playerId);
    if (!player) return;

    // Mark as disconnected
    player.isDisconnected = true;

    // Schedule removal after 3 seconds
    setTimeout(() => {
      const playerIndex = this.gameState.players.findIndex(p => p.id === playerId);
      if (playerIndex === -1) return;

      const wasHost = this.gameState.players[playerIndex].isHost;
      this.gameState.players.splice(playerIndex, 1);

      // Promote new host if needed
      if (wasHost && this.gameState.players.length > 0) {
        const sortedPlayers = [...this.gameState.players].sort((a, b) => a.joinedAt - b.joinedAt);
        sortedPlayers[0].isHost = true;
      }

      // Broadcast updated state
      this.broadcast({
        type: 'STATE_SYNC',
        payload: this.gameState,
      });
    }, 3000);
  }

  broadcast(message: SocketMessage) {
    // Send to all connected WebSocket clients
    this.sessions.forEach((_, ws) => {
      this.sendToClient(ws, message);
    });
  }

  sendToClient(websocket: WebSocket, message: SocketMessage) {
    try {
      if (websocket.readyState === 1) { // OPEN
        websocket.send(JSON.stringify(message));
      }
    } catch (error) {
      console.error('Error sending message to client:', error);
    }
  }
}
