import React, { useState, useMemo, useRef } from 'react';
import { useGameSession } from './services/websocketService';
import { Table3D, Table3DRef } from './components/Table3D';
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

// Game component that only mounts after user enters name
const GameSession: React.FC<{
  playerName: string;
  sessionId: string;
  isHost: boolean;
  onCopyLink: () => void;
  avatarSeed: string;
}> = ({ playerName, sessionId, isHost, onCopyLink, avatarSeed }) => {
  const table3DRef = useRef<Table3DRef>(null);
  // Weapon selection state - defaults to volleyball
  const [selectedWeapon, setSelectedWeapon] = useState('🏐');

  const { myId, gameState, vote, revealVotes, resetRound, throwEmoji, removeEmojiThrow } = useGameSession(
    playerName,
    sessionId,
    isHost,
    selectedWeapon, // Pass selected weapon to game session
    avatarSeed // Pass avatar seed to use as player ID for consistent avatars
  );

  return (
    <div className="w-full h-screen relative overflow-hidden bg-gray-900">
      {/* 3D Scene */}
      <Table3D
        ref={table3DRef}
        players={gameState.players}
        status={gameState.status}
        average={gameState.average}
        myId={myId}
        emojiThrows={gameState.emojiThrows}
        onThrowEmoji={throwEmoji}
        onEmojiThrowComplete={removeEmojiThrow}
      />

      {/* 2D Overlay */}
      <UIOverlay
        myId={myId}
        gameState={gameState}
        onVote={vote}
        onReveal={revealVotes}
        onReset={resetRound}
        onResetCamera={() => table3DRef.current?.resetCamera()}
        selectedWeapon={selectedWeapon}
        onSelectWeapon={setSelectedWeapon}
      />

      {/* Share Floating Button */}
      <button
        onClick={onCopyLink}
        className="absolute top-4 right-4 z-20 bg-white/10 hover:bg-white/20 text-white p-2 rounded-full backdrop-blur-md border border-white/10 transition-all"
        title="Copy Invite Link"
      >
        <LinkIcon size={20} />
      </button>
    </div>
  );
};

const App = () => {
  // Load saved name from localStorage on mount
  const [name, setName] = useState(() => localStorage.getItem('happypoints_name') || '');
  const [started, setStarted] = useState(false);
  const [confirmedName, setConfirmedName] = useState('');
  // Avatar seed for DiceBear - can be randomized to change avatar
  const [avatarSeed, setAvatarSeed] = useState(() =>
    localStorage.getItem('happypoints_avatar_seed') || Math.random().toString(36).substring(2, 9)
  );

  // Router state
  const [urlParams, setUrlParams] = useState(getHashParams());

  const sessionId = useMemo(() => {
    return urlParams.session || Math.random().toString(36).substring(2, 8).toUpperCase();
  }, [urlParams.session]);

  // Is this user the creator? (Simplified: if no session in URL initially, they are creator)
  const isHost = useMemo(() => !urlParams.session, [urlParams.session]);

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    // Save name and avatar seed to localStorage
    localStorage.setItem('happypoints_name', name.trim());
    localStorage.setItem('happypoints_avatar_seed', avatarSeed);

    setConfirmedName(name.trim());

    if (isHost) {
      window.location.hash = `session=${sessionId}`;
    }
    setStarted(true);
  };

  // Generate new random avatar
  const changeAvatar = () => {
    const newSeed = Math.random().toString(36).substring(2, 9);
    setAvatarSeed(newSeed);
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
            <h1 className="text-4xl font-bold text-white mb-2">HappyPoints</h1>
            <p className="text-gray-300">Real-time estimation for agile teams</p>
          </div>

          <form onSubmit={handleStart} className="space-y-6">
            {/* Avatar Selector */}
            <div className="flex justify-center">
              <button
                type="button"
                onClick={changeAvatar}
                className="group relative w-24 h-24 rounded-full overflow-hidden border-4 border-gray-600 hover:border-green-500 transition-all cursor-pointer bg-white"
                title="Click to change avatar"
              >
                <img
                  src={`https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(avatarSeed)}&format=svg`}
                  alt="Your avatar"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold">
                  Change
                </div>
              </button>
            </div>

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

        </div>
      </div>
    );
  }

  return (
    <GameSession
      playerName={confirmedName}
      sessionId={sessionId}
      isHost={isHost}
      onCopyLink={copyLink}
      avatarSeed={avatarSeed}
    />
  );
};

export default App;