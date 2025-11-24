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
};

export const useGameSession = (initialPlayerName: string, sessionId: string, isHost: boolean) => {
  const [gameState, setGameState] = useState<GameState>({
    ...DEFAULT_STATE,
    sessionId,
  });

  const [myId] = useState(() => Math.random().toString(36).substring(2, 9));
  const [channel] = useState(() => new BroadcastChannel(CHANNEL_NAME));

  // Helper to broadcast updates
  const broadcast = useCallback((msg: SocketMessage) => {
    channel.postMessage(msg);
  }, [channel]);

  // --- Actions ---

  const joinGame = useCallback(() => {
    const now = Date.now();
    const newPlayer: Player = {
      id: myId,
      name: initialPlayerName,
      isHost,
      vote: null,
      joinedAt: now, // Track join time for host succession
      isDisconnected: false
    };

    setGameState(prev => {
      // Avoid duplicates
      if (prev.players.find(p => p.id === myId)) return prev;
      return { ...prev, players: [...prev.players, newPlayer] };
    });

    broadcast({ type: 'JOIN', payload: newPlayer });

    // If I am new, ask for current state
    if (!isHost) {
      broadcast({ type: 'SYNC_REQUEST', payload: null });
    }
  }, [broadcast, myId, initialPlayerName, isHost]);

  const vote = useCallback((card: string) => {
    setGameState(prev => {
      const updatedPlayers = prev.players.map(p => 
        p.id === myId ? { ...p, vote: card as any } : p
      );
      return { ...prev, players: updatedPlayers };
    });
    broadcast({ type: 'VOTE', payload: { id: myId, vote: card } });
  }, [broadcast, myId]);

  const revealVotes = useCallback(async () => {
    if (!isHost) return;
    
    // Calculate Average (ignoring non-numbers)
    let sum = 0;
    let count = 0;
    const numericVotes: number[] = [];
    const rawVotes: string[] = [];

    gameState.players.forEach(p => {
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

    setGameState(prev => ({ ...prev, ...newState }));
    broadcast({ type: 'REVEAL', payload: newState });

  }, [broadcast, isHost, gameState.players]);

  const resetRound = useCallback(() => {
    if (!isHost) return;
    const newState = {
      status: GameStatus.VOTING,
      average: null,
      aiSummary: null,
      players: gameState.players.map(p => ({ ...p, vote: null })) // Clear votes locally first logic
    };
    
    // Actually we need to clear everyone's vote in the broadcast
    broadcast({ type: 'RESET', payload: null });
    
    // Local update
    setGameState(prev => ({
        ...prev,
        status: GameStatus.VOTING,
        average: null,
        aiSummary: null,
        players: prev.players.map(p => ({...p, vote: null}))
    }));

  }, [broadcast, isHost, gameState.players]);

  // --- Event Listener ---

  useEffect(() => {
    const handleMessage = (event: MessageEvent<SocketMessage>) => {
      const { type, payload } = event.data;

      switch (type) {
        case 'JOIN':
          setGameState(prev => {
            if (prev.players.find(p => p.id === payload.id)) return prev;
            return { ...prev, players: [...prev.players, payload] };
          });
          // If I am host, I should sync back the current state to the new joiner
          if (isHost) {
             // We can't do this immediately inside the reducer, so we trigger an effect or just send it
             // Sending SYNC_RESPONSE with current state (hacky but works for broadcast channel)
             setTimeout(() => {
                 channel.postMessage({
                     type: 'SYNC_RESPONSE',
                     payload: {
                         status: gameState.status,
                         players: [...gameState.players, payload], // Ensure new player is included
                         average: gameState.average,
                         aiSummary: gameState.aiSummary
                     }
                 });
             }, 100);
          }
          break;

        case 'VOTE':
          setGameState(prev => ({
            ...prev,
            players: prev.players.map(p => p.id === payload.id ? { ...p, vote: payload.vote } : p)
          }));
          break;

        case 'REVEAL':
          setGameState(prev => ({
            ...prev,
            status: GameStatus.REVEALED,
            average: payload.average,
            aiSummary: payload.aiSummary
          }));
          break;

        case 'RESET':
          setGameState(prev => ({
            ...prev,
            status: GameStatus.VOTING,
            average: null,
            aiSummary: null,
            players: prev.players.map(p => ({ ...p, vote: null }))
          }));
          break;

        case 'SYNC_REQUEST':
           if (isHost) {
             channel.postMessage({
                 type: 'SYNC_RESPONSE',
                 payload: gameState
             });
           }
           break;

        case 'SYNC_RESPONSE':
           // Merge state
           setGameState(prev => {
             // Simple merge strategy: trust the host's payload
             // But keep my own identity if it got lost (shouldn't happen)
             const myPlayer = prev.players.find(p => p.id === myId);
             let mergedPlayers = payload.players;
             if (myPlayer && !mergedPlayers.find((p: Player) => p.id === myId)) {
                 mergedPlayers.push(myPlayer);
             }
             return {
                 ...payload,
                 players: mergedPlayers
             };
           });
           break;

        case 'LEAVE':
          // Mark player as disconnected, then remove after delay
          setGameState(prev => ({
            ...prev,
            players: prev.players.map(p =>
              p.id === payload.id ? { ...p, isDisconnected: true } : p
            )
          }));

          // After 3 seconds, remove the player completely
          setTimeout(() => {
            setGameState(prev => {
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
      }
    };

    channel.onmessage = handleMessage;
    // Initial Join
    joinGame();

    return () => {
      channel.onmessage = null;
    };
  }, [channel, joinGame, isHost, myId]); // Dependencies intentionally simplified to avoid loops

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
    resetRound
  };
};