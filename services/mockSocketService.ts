import { useEffect, useState, useCallback } from 'react';
import { GameState, Player, GameStatus, SocketMessage } from '../types';
import { generateVoteSummary } from './geminiService';

// Using BroadcastChannel to simulate sockets across tabs in the same browser
const CHANNEL_NAME = 'poker_planning_channel';

const DEFAULT_STATE: GameState = {
  sessionId: '',
  status: GameStatus.VOTING,
  players: [],
  average: null,
  aiSummary: null,
  emojiThrows: [],
};

// Get session state from localStorage (shared across all tabs)
const getSessionState = (sessionId: string): GameState => {
  const key = `poker_session_${sessionId}`;
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      const state = JSON.parse(stored);
      // Filter out any disconnected players that shouldn't be shown to new joiners
      return {
        ...state,
        players: state.players.filter((p: Player) => !p.isDisconnected)
      };
    } catch (e) {
      console.error('Failed to parse session state:', e);
    }
  }
  return { ...DEFAULT_STATE, sessionId };
};

// Save session state to localStorage (shared across all tabs)
const saveSessionState = (state: GameState) => {
  const key = `poker_session_${state.sessionId}`;
  localStorage.setItem(key, JSON.stringify(state));
};

export const useGameSession = (initialPlayerName: string, sessionId: string, isHost: boolean) => {
  // Initialize from localStorage to get shared session state
  const [gameState, setGameState] = useState<GameState>(() => getSessionState(sessionId));

  const [myId] = useState(() => Math.random().toString(36).substring(2, 9));
  const [channel] = useState(() => new BroadcastChannel(CHANNEL_NAME));

  // Helper to update state both locally and in localStorage
  const updateGameState = useCallback((updater: (prev: GameState) => GameState) => {
    setGameState(prev => {
      const newState = updater(prev);
      saveSessionState(newState);
      return newState;
    });
  }, []);

  // Helper to broadcast updates
  const broadcast = useCallback((msg: SocketMessage) => {
    channel.postMessage(msg);
  }, [channel]);

  // --- Actions ---

  const joinGame = useCallback(() => {
    const now = Date.now();

    updateGameState(prev => {
      // Avoid duplicates
      if (prev.players.find(p => p.id === myId)) return prev;

      // Determine if this player should be host: first player in the session is host
      const shouldBeHost = prev.players.length === 0;

      const newPlayer: Player = {
        id: myId,
        name: initialPlayerName,
        isHost: shouldBeHost,
        vote: null,
        joinedAt: now,
        isDisconnected: false,
        health: 100,
        isKnockedOut: false
      };

      const newState = { ...prev, players: [...prev.players, newPlayer] };

      // Broadcast join to other tabs
      broadcast({ type: 'JOIN', payload: newPlayer });

      return newState;
    });
  }, [broadcast, myId, initialPlayerName, updateGameState]);

  const vote = useCallback((card: string) => {
    // If empty string is sent, treat it as clearing the vote (set to null)
    const voteValue = card === '' ? null : card;

    updateGameState(prev => {
      const updatedPlayers = prev.players.map(p =>
        p.id === myId ? { ...p, vote: voteValue as any } : p
      );
      return { ...prev, players: updatedPlayers };
    });
    broadcast({ type: 'VOTE', payload: { id: myId, vote: voteValue } });
  }, [broadcast, myId, updateGameState]);

  const revealVotes = useCallback(async () => {
    // Check if I'm host by looking at current state
    const currentState = getSessionState(sessionId);
    const me = currentState.players.find(p => p.id === myId);
    if (!me?.isHost) return;

    // Calculate Average (ignoring non-numbers)
    let sum = 0;
    let count = 0;
    const numericVotes: number[] = [];
    const rawVotes: string[] = [];

    currentState.players.forEach(p => {
      if (p.vote && p.vote !== '?' && p.vote !== '☕') {
        const val = parseInt(p.vote);
        if (!isNaN(val)) {
          sum += val;
          count++;
          numericVotes.push(val);
        }
      }
      if(p.vote) rawVotes.push(p.vote);
    });

    // Use 2 decimal places for precision
    const avg = count > 0 ? parseFloat((sum / count).toFixed(2)) : 0;

    // Call Gemini for insight
    const summary = await generateVoteSummary(rawVotes);

    const newState = {
      status: GameStatus.REVEALED,
      average: avg,
      aiSummary: summary
    };

    updateGameState(prev => ({ ...prev, ...newState }));
    broadcast({ type: 'REVEAL', payload: newState });

  }, [broadcast, myId, sessionId, updateGameState]);

  const resetRound = useCallback(() => {
    // Check if I'm host by looking at current state
    const currentState = getSessionState(sessionId);
    const me = currentState.players.find(p => p.id === myId);
    if (!me?.isHost) return;

    // Update and broadcast
    updateGameState(prev => ({
        ...prev,
        status: GameStatus.VOTING,
        average: null,
        aiSummary: null,
        players: prev.players.map(p => ({...p, vote: null}))
    }));

    broadcast({ type: 'RESET', payload: null });
  }, [broadcast, myId, sessionId, updateGameState]);

  // Throw emoji from current player to target player
  const throwEmoji = useCallback((targetPlayerId: string) => {
    const throwId = Math.random().toString(36).substring(2, 9);
    const emojiThrow = {
      id: throwId,
      fromPlayerId: myId,
      toPlayerId: targetPlayerId,
      emoji: '🏐', // Volleyball emoji
      timestamp: Date.now(),
    };

    // Add to local state
    updateGameState(prev => ({
      ...prev,
      emojiThrows: [...prev.emojiThrows, emojiThrow],
    }));

    // Broadcast to other tabs
    broadcast({ type: 'THROW_EMOJI', payload: emojiThrow });
  }, [broadcast, myId, updateGameState]);

  // Remove completed emoji throw from state and damage the target player
  const removeEmojiThrow = useCallback((throwId: string) => {
    // Find the throw to get target player ID
    const currentState = getSessionState(sessionId);
    const throwData = currentState.emojiThrows.find(t => t.id === throwId);

    if (throwData) {
      // Damage the target player
      const damage = 20; // Each emoji hit does 20 damage

      updateGameState(prev => {
        const updatedPlayers = prev.players.map(p => {
          if (p.id === throwData.toPlayerId) {
            const newHealth = Math.max(0, p.health - damage);
            return {
              ...p,
              health: newHealth,
              isKnockedOut: newHealth === 0,
              lastHitTimestamp: Date.now()
            };
          }
          return p;
        });

        return {
          ...prev,
          players: updatedPlayers,
          emojiThrows: prev.emojiThrows.filter(t => t.id !== throwId),
        };
      });

      // Broadcast the hit to other tabs
      broadcast({
        type: 'HIT_PLAYER',
        payload: {
          playerId: throwData.toPlayerId,
          damage,
          timestamp: Date.now()
        }
      });

      // If player was knocked out, reset their health after 3 seconds
      const targetPlayer = currentState.players.find(p => p.id === throwData.toPlayerId);
      if (targetPlayer && targetPlayer.health - damage <= 0) {
        setTimeout(() => {
          updateGameState(prev => ({
            ...prev,
            players: prev.players.map(p =>
              p.id === throwData.toPlayerId
                ? { ...p, health: 100, isKnockedOut: false }
                : p
            )
          }));
          broadcast({ type: 'HIT_PLAYER', payload: { playerId: throwData.toPlayerId, reset: true } });
        }, 3000);
      }
    } else {
      // Just remove the throw if not found
      updateGameState(prev => ({
        ...prev,
        emojiThrows: prev.emojiThrows.filter(t => t.id !== throwId),
      }));
    }
  }, [updateGameState, sessionId, broadcast]);

  // --- Event Listener ---

  useEffect(() => {
    const handleMessage = (event: MessageEvent<SocketMessage>) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'JOIN':
          updateGameState(prev => {
            if (prev.players.find(p => p.id === payload.id)) return prev;
            return { ...prev, players: [...prev.players, payload] };
          });
          break;

        case 'VOTE':
          updateGameState(prev => ({
            ...prev,
            players: prev.players.map(p => p.id === payload.id ? { ...p, vote: payload.vote } : p)
          }));
          break;

        case 'REVEAL':
          updateGameState(prev => ({
            ...prev,
            status: GameStatus.REVEALED,
            average: payload.average,
            aiSummary: payload.aiSummary
          }));
          break;

        case 'RESET':
          updateGameState(prev => ({
            ...prev,
            status: GameStatus.VOTING,
            average: null,
            aiSummary: null,
            players: prev.players.map(p => ({ ...p, vote: null }))
          }));
          break;

        case 'LEAVE':
          // Mark player as disconnected
          updateGameState(prev => ({
            ...prev,
            players: prev.players.map(p =>
              p.id === payload.id ? { ...p, isDisconnected: true } : p
            )
          }));

          // After 3 seconds, remove the player completely
          setTimeout(() => {
            updateGameState(prev => {
              const remainingPlayers = prev.players.filter(p => p.id !== payload.id);

              // If the host left, promote the next player (oldest by joinedAt)
              if (remainingPlayers.length > 0) {
                const oldHost = prev.players.find(p => p.id === payload.id)?.isHost;
                if (oldHost) {
                  // Sort by joinedAt to find the next in line
                  const sortedPlayers = [...remainingPlayers].sort((a, b) => a.joinedAt - b.joinedAt);
                  sortedPlayers[0].isHost = true;
                }
              }

              return { ...prev, players: remainingPlayers };
            });
          }, 3000);
          break;

        case 'THROW_EMOJI':
          // Add emoji throw to state
          updateGameState(prev => ({
            ...prev,
            emojiThrows: [...prev.emojiThrows, payload],
          }));
          break;

        case 'HIT_PLAYER':
          if (payload.reset) {
            // Reset player health
            updateGameState(prev => ({
              ...prev,
              players: prev.players.map(p =>
                p.id === payload.playerId
                  ? { ...p, health: 100, isKnockedOut: false }
                  : p
              )
            }));
          } else {
            // Damage player
            updateGameState(prev => ({
              ...prev,
              players: prev.players.map(p => {
                if (p.id === payload.playerId) {
                  const newHealth = Math.max(0, p.health - payload.damage);
                  return {
                    ...p,
                    health: newHealth,
                    isKnockedOut: newHealth === 0,
                    lastHitTimestamp: payload.timestamp
                  };
                }
                return p;
              })
            }));
          }
          break;
      }
    };

    channel.onmessage = handleMessage;
    // Initial Join
    joinGame();

    return () => {
      channel.onmessage = null;
    };
  }, [channel, joinGame, updateGameState]); // Dependencies intentionally simplified to avoid loops

  // --- Window Close Detection ---
  // Detect when tab/window is closed and broadcast LEAVE message
  useEffect(() => {
    const handleBeforeUnload = () => {
      // Broadcast that this player is leaving
      // Note: This runs synchronously before the tab closes
      channel.postMessage({ type: 'LEAVE', payload: { id: myId } });
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [channel, myId]);

  return {
    myId,
    gameState,
    vote,
    revealVotes,
    resetRound,
    throwEmoji,
    removeEmojiThrow
  };
};