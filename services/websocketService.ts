import { useEffect, useState, useCallback, useRef } from 'react';
import { GameState, Player, GameStatus, SocketMessage } from '../types';
import { generateVoteSummary } from './geminiService';
import { flashEmojiFavicon } from '../utils/favicon';

const DEFAULT_STATE: GameState = {
  sessionId: '',
  status: GameStatus.VOTING,
  players: [],
  average: null,
  aiSummary: null,
  emojiThrows: [],
};

/**
 * WebSocket service for real multiplayer via Cloudflare Workers
 * Connects to Worker endpoint and handles real-time game state synchronization
 *
 * For local development: Worker runs on localhost:8787
 * For production: Worker runs on deployed Cloudflare domain
 */
export const useGameSession = (
  initialPlayerName: string,
  sessionId: string,
  isHost: boolean,
  selectedWeapon: string = '🏐',
  avatarSeed?: string
) => {
  const [gameState, setGameState] = useState<GameState>({ ...DEFAULT_STATE, sessionId });
  // Use avatarSeed as player ID if provided, otherwise generate random ID
  const [myId] = useState(() => avatarSeed || Math.random().toString(36).substring(2, 9));
  const [isConnected, setIsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Determine WebSocket URL based on environment
  const getWebSocketUrl = useCallback(() => {
    // Check if we're in development or production
    const isDevelopment = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (isDevelopment) {
      // Local Wrangler dev server
      return `ws://localhost:8787/ws/${sessionId}`;
    } else {
      // Production Cloudflare Worker with custom domain
      const workerDomain = import.meta.env.VITE_WORKER_URL || 'api.happypoints.app';
      return `wss://${workerDomain}/ws/${sessionId}`;
    }
  }, [sessionId]);

  // Send message via WebSocket
  const send = useCallback((message: SocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // --- Actions ---

  const joinGame = useCallback(() => {
    const now = Date.now();

    const newPlayer: Player = {
      id: myId,
      name: initialPlayerName,
      isHost: isHost,
      vote: null,
      joinedAt: now,
      isDisconnected: false,
      health: 100,
      isKnockedOut: false,
      poopHitCount: 0,
      isMonkey: false,
    };

    send({ type: 'JOIN', payload: newPlayer });
  }, [send, myId, initialPlayerName, isHost]);

  const vote = useCallback(
    (card: string) => {
      const voteValue = card === '' ? null : card;
      send({ type: 'VOTE', payload: { id: myId, vote: voteValue } });
    },
    [send, myId]
  );

  const revealVotes = useCallback(() => {
    // Check if I'm host
    const me = gameState.players.find(p => p.id === myId);
    if (!me?.isHost) return;

    // Send REVEAL immediately with no AI summary
    send({
      type: 'REVEAL',
      payload: {
        status: GameStatus.REVEALED,
        average: null, // Server will calculate
        aiSummary: null, // Will be updated asynchronously
      },
    });

    // Fetch AI summary asynchronously (non-blocking)
    const rawVotes: string[] = [];
    gameState.players.forEach(p => {
      if (p.vote) rawVotes.push(p.vote);
    });

    generateVoteSummary(rawVotes).then(summary => {
      // Send AI_SUMMARY update after it's ready
      send({
        type: 'AI_SUMMARY',
        payload: { aiSummary: summary },
      });
    });
  }, [send, myId, gameState.players]);

  const resetRound = useCallback(() => {
    // Check if I'm host
    const me = gameState.players.find(p => p.id === myId);
    if (!me?.isHost) return;

    send({ type: 'RESET', payload: null });
  }, [send, myId, gameState.players]);

  const throwEmoji = useCallback(
    (targetPlayerId: string) => {
      const throwId = Math.random().toString(36).substring(2, 9);
      const emojiThrow = {
        id: throwId,
        fromPlayerId: myId,
        toPlayerId: targetPlayerId,
        emoji: selectedWeapon,
        timestamp: Date.now(),
      };

      send({ type: 'THROW_EMOJI', payload: emojiThrow });
    },
    [send, myId, selectedWeapon]
  );

  const removeEmojiThrow = useCallback(
    (throwId: string) => {
      const throwData = gameState.emojiThrows.find(t => t.id === throwId);

      if (throwData) {
        const damage = 1;

        send({
          type: 'HIT_PLAYER',
          payload: {
            throwId, // Include throwId so we remove the correct emoji
            playerId: throwData.toPlayerId,
            damage,
            timestamp: Date.now(),
            emoji: throwData.emoji, // Include emoji for favicon change
          },
        });

        // Schedule health reset if knocked out
        const targetPlayer = gameState.players.find(p => p.id === throwData.toPlayerId);
        if (targetPlayer && targetPlayer.health - damage <= 0) {
          setTimeout(() => {
            send({
              type: 'HIT_PLAYER',
              payload: { playerId: throwData.toPlayerId, reset: true },
            });
          }, 3000);
        }
      }
    },
    [send, gameState.emojiThrows, gameState.players]
  );

  // --- WebSocket Connection Management ---

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const ws = new WebSocket(getWebSocketUrl());

    // Set ref immediately so send() can use it
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      setIsConnected(true);
      joinGame();
    };

    ws.onmessage = (event) => {
      try {
        const message: SocketMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'STATE_SYNC':
            // Full state sync from server
            setGameState(message.payload);
            break;

          case 'JOIN':
            setGameState(prev => {
              const existingIndex = prev.players.findIndex(p => p.id === message.payload.id);
              if (existingIndex !== -1) {
                // Player already exists - UPDATE their data (especially isHost from server)
                const updatedPlayers = [...prev.players];
                updatedPlayers[existingIndex] = message.payload;
                return { ...prev, players: updatedPlayers };
              }
              // New player - add them
              return { ...prev, players: [...prev.players, message.payload] };
            });
            break;

          case 'VOTE':
            setGameState(prev => ({
              ...prev,
              players: prev.players.map(p =>
                p.id === message.payload.id ? { ...p, vote: message.payload.vote } : p
              ),
            }));
            break;

          case 'REVEAL':
            setGameState(prev => ({
              ...prev,
              status: GameStatus.REVEALED,
              average: message.payload.average,
              aiSummary: message.payload.aiSummary,
            }));
            break;

          case 'AI_SUMMARY':
            // Update AI summary asynchronously after reveal
            setGameState(prev => ({
              ...prev,
              aiSummary: message.payload.aiSummary,
            }));
            break;

          case 'RESET':
            setGameState(prev => ({
              ...prev,
              status: GameStatus.VOTING,
              average: null,
              aiSummary: null,
              players: prev.players.map(p => ({ ...p, vote: null })),
            }));
            break;

          case 'LEAVE':
            setGameState(prev => ({
              ...prev,
              players: prev.players.map(p =>
                p.id === message.payload.id ? { ...p, isDisconnected: true } : p
              ),
            }));

            // Remove disconnected player after 3 seconds
            setTimeout(() => {
              setGameState(prev => {
                const remainingPlayers = prev.players.filter(p => p.id !== message.payload.id);

                // Promote new host if needed
                if (remainingPlayers.length > 0) {
                  const oldHost = prev.players.find(p => p.id === message.payload.id)?.isHost;
                  if (oldHost) {
                    const sortedPlayers = [...remainingPlayers].sort(
                      (a, b) => a.joinedAt - b.joinedAt
                    );
                    sortedPlayers[0].isHost = true;
                  }
                }

                return { ...prev, players: remainingPlayers };
              });
            }, 3000);
            break;

          case 'THROW_EMOJI':
            // Track poop throws - the THROWER transforms to monkey at 5 poops thrown
            setGameState(prev => {
              const emojiThrow = message.payload;
              const isPoop = emojiThrow.emoji === '💩';

              return {
                ...prev,
                emojiThrows: [...prev.emojiThrows, emojiThrow],
                players: isPoop
                  ? prev.players.map(p => {
                      if (p.id === emojiThrow.fromPlayerId) {
                        const newPoopCount = (p.poopHitCount || 0) + 1;
                        return {
                          ...p,
                          poopHitCount: newPoopCount,
                          isMonkey: newPoopCount >= 5 || p.isMonkey,
                        };
                      }
                      return p;
                    })
                  : prev.players,
              };
            });
            break;

          case 'HIT_PLAYER':
            if (message.payload.reset) {
              setGameState(prev => ({
                ...prev,
                players: prev.players.map(p =>
                  p.id === message.payload.playerId
                    ? { ...p, health: 100, isKnockedOut: false }
                    : p
                ),
              }));
            } else {
              // If this player got hit and emoji is provided, change favicon for 3 seconds
              if (message.payload.playerId === myId && message.payload.emoji) {
                flashEmojiFavicon(message.payload.emoji);
              }

              setGameState(prev => ({
                ...prev,
                players: prev.players.map(p => {
                  if (p.id === message.payload.playerId) {
                    const newHealth = Math.max(0, p.health - (message.payload.damage || 0));
                    return {
                      ...p,
                      health: newHealth,
                      isKnockedOut: newHealth === 0,
                      lastHitTimestamp: message.payload.timestamp,
                    };
                  }
                  return p;
                }),
                // Remove only the specific emoji throw by ID
                emojiThrows: prev.emojiThrows.filter(
                  t => t.id !== message.payload.throwId
                ),
              }));
            }
            break;

          case 'ERROR':
            console.error('Server error:', message.payload.message);
            break;
        }
      } catch (error) {
        console.error('Error handling WebSocket message:', error);
      }
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setIsConnected(false);

      // Attempt reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('Attempting to reconnect...');
        connect();
      }, 3000);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      ws.close();
    };
  }, [getWebSocketUrl, joinGame]);

  // Connect on mount
  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  // Auto-reveal after all players vote
  useEffect(() => {
    const me = gameState.players.find(p => p.id === myId);
    if (!me?.isHost || gameState.status !== GameStatus.VOTING) {
      return;
    }

    const activePlayers = gameState.players.filter(p => !p.isDisconnected);
    if (activePlayers.length < 2) return;

    const allVoted = activePlayers.every(p => p.vote !== null);

    if (allVoted) {
      const timer = setTimeout(() => {
        revealVotes();
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [gameState.players, gameState.status, myId, revealVotes]);

  // Send LEAVE message on window close
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'LEAVE', payload: { id: myId } }));
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [myId]);

  return {
    myId,
    gameState,
    vote,
    revealVotes,
    resetRound,
    throwEmoji,
    removeEmojiThrow,
    isConnected,
  };
};
