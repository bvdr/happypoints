import React, { useState, useMemo } from 'react';
import { useGameSession } from './services/mockSocketService';
import { Table3D } from './components/Table3D';
import { UIOverlay } from './components/UIOverlay';
import { Users, Play, Link as LinkIcon, Copy } from 'lucide-react';

// Simple hash router extraction
const getHashParams = () => {
  const hash = window.location.hash.substring(1);
  const params = new URLSearchParams(hash);
  return {
    session: params.get('session'),
  };
};

const App = () => {
  const [name, setName] = useState('');
  const [started, setStarted] = useState(false);
  
  // Router state
  const [urlParams, setUrlParams] = useState(getHashParams());
  
  const sessionId = useMemo(() => {
    return urlParams.session || Math.random().toString(36).substring(2, 8).toUpperCase();
  }, [urlParams.session]);

  // Is this user the creator? (Simplified: if no session in URL initially, they are creator)
  const isHost = useMemo(() => !urlParams.session, [urlParams.session]);

  const { myId, gameState, vote, revealVotes, resetRound } = useGameSession(
    name, 
    sessionId, 
    isHost
  );

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    
    if (isHost) {
      window.location.hash = `session=${sessionId}`;
    }
    setStarted(true);
  };

  const copyLink = () => {
    const url = `${window.location.origin}${window.location.pathname}#session=${sessionId}`;
    navigator.clipboard.writeText(url);
    alert("Link copied to clipboard!");
  };

  if (!started) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 via-green-900 to-black flex items-center justify-center p-4">
        <div className="bg-white/10 backdrop-blur-lg p-8 rounded-2xl shadow-2xl max-w-md w-full border border-white/20">
          <div className="text-center mb-8">
            <h1 className="text-4xl font-bold text-white mb-2">Planning Poker 3D</h1>
            <p className="text-gray-300">Real-time estimation for agile teams</p>
          </div>

          <form onSubmit={handleStart} className="space-y-6">
            <div>
              <label className="block text-gray-300 text-sm font-bold mb-2" htmlFor="name">
                Your Name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg bg-black/30 border border-gray-600 text-white placeholder-gray-500 focus:outline-none focus:border-green-500 transition-colors"
                placeholder="Enter your name..."
                maxLength={12}
              />
            </div>

            {!isHost && (
              <div className="p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg text-blue-200 text-sm flex items-center gap-2">
                 <Users size={16} /> Joining Session: {sessionId}
              </div>
            )}

            <button
              type="submit"
              disabled={!name.trim()}
              className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 px-6 rounded-lg transition-all transform hover:scale-[1.02] flex items-center justify-center gap-2"
            >
              {isHost ? 'Start New Session' : 'Join Session'} <Play size={18} fill="currentColor" />
            </button>
          </form>

          <div className="mt-8 pt-6 border-t border-gray-700 text-center text-xs text-gray-500">
            <p>Powered by React Three Fiber & Gemini API</p>
            <p className="mt-1 text-orange-400/80">
              Disclaimer: Demo uses local browser channels. Open multiple tabs to simulate players.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-screen relative overflow-hidden bg-gray-900">
      {/* 3D Scene */}
      <Table3D 
        players={gameState.players} 
        status={gameState.status} 
        average={gameState.average}
        myId={myId}
      />

      {/* 2D Overlay */}
      <UIOverlay 
        myId={myId}
        gameState={gameState}
        onVote={vote}
        onReveal={revealVotes}
        onReset={resetRound}
      />

      {/* Share Floating Button */}
      <button 
        onClick={copyLink}
        className="absolute top-4 right-4 z-20 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md border border-white/10 transition-all"
        title="Copy Invite Link"
      >
        <LinkIcon size={20} />
      </button>
    </div>
  );
};

export default App;