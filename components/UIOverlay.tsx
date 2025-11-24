import React from 'react';
import { GameState, GameStatus } from '../types';
import { FIBONACCI_DECK } from '../constants';
import { Users, RotateCcw, Eye, Info } from 'lucide-react';

interface UIOverlayProps {
  myId: string;
  gameState: GameState;
  onVote: (val: string) => void;
  onReveal: () => void;
  onReset: () => void;
}

export const UIOverlay: React.FC<UIOverlayProps> = ({
  myId,
  gameState,
  onVote,
  onReveal,
  onReset,
}) => {
  const me = gameState.players.find((p) => p.id === myId);
  const isHost = me?.isHost;
  const myVote = me?.vote;

  return (
    <div className="absolute inset-0 z-10 pointer-events-none flex flex-col justify-between">
      {/* Top Bar */}
      <div className="pointer-events-auto p-4 flex justify-between items-start bg-gradient-to-b from-black/90 to-transparent z-20">
        <div>
          <h1 className="text-white font-bold text-2xl tracking-tight drop-shadow-md">Planning Poker 3D</h1>
          <p className="text-gray-400 text-xs font-mono flex items-center gap-2 mt-1">
            <span className="bg-gray-800 px-2 py-1 rounded border border-gray-700 text-green-400">SESSION: {gameState.sessionId}</span>
            <span className="flex items-center gap-1"><Users size={12} /> {gameState.players.length}</span>
          </p>
        </div>
        
        {/* Host Controls */}
        {isHost && (
          <div className="flex gap-2 bg-black/60 p-2 rounded-xl border border-gray-700/50 backdrop-blur-md shadow-xl">
             {gameState.status === GameStatus.VOTING ? (
                <button 
                  onClick={onReveal}
                  className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-yellow-600 to-yellow-500 hover:from-yellow-500 hover:to-yellow-400 text-white rounded-lg font-bold shadow-lg transition-all transform hover:scale-105"
                >
                  <Eye size={18} /> REVEAL
                </button>
             ) : (
                <button 
                  onClick={onReset}
                  className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg font-bold shadow-lg transition-all transform hover:scale-105"
                >
                  <RotateCcw size={18} /> NEW ROUND
                </button>
             )}
          </div>
        )}
      </div>

      {/* AI Summary Toast (Absolute Top Center) */}
      {gameState.status === GameStatus.REVEALED && gameState.aiSummary && (
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 pointer-events-auto bg-indigo-950/90 text-indigo-100 border border-indigo-500/50 px-6 py-4 rounded-xl max-w-md text-center shadow-2xl backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-500 z-50">
           <div className="flex justify-center mb-2 text-indigo-400">
             <Info size={20} />
           </div>
           <p className="text-lg font-light leading-snug italic">"{gameState.aiSummary}"</p>
           <div className="mt-2 text-[10px] font-bold text-indigo-500 uppercase tracking-widest">Gemini Analysis</div>
        </div>
      )}

      {/* Bottom Deck */}
      <div className="pointer-events-auto pb-6 pt-10 px-4 flex justify-center items-end bg-gradient-to-t from-black via-black/80 to-transparent">
         {/* Added pt-12 and items-end to allow space for the pop-up animation without clipping */}
         <div className="flex gap-3 overflow-x-auto max-w-full pb-4 px-4 pt-12 items-end scrollbar-hide mask-fade-sides">
            {FIBONACCI_DECK.map((val) => {
              const isSelected = myVote === val;
              return (
                <button
                  key={val}
                  onClick={() => onVote(val)}
                  className={`
                    relative group flex flex-col items-center justify-center
                    w-14 h-20 md:w-16 md:h-24 rounded-lg border shadow-2xl shrink-0
                    transition-all duration-200 ease-out
                    ${isSelected 
                      ? 'bg-blue-600 border-blue-400 -translate-y-6 scale-110 z-20 shadow-blue-500/50 ring-2 ring-white' 
                      : 'bg-white border-gray-400 hover:-translate-y-3 hover:bg-gray-50'
                    }
                  `}
                >
                  {/* Card inner design */}
                  <div className={`
                    absolute inset-1 rounded border 
                    ${isSelected ? 'border-blue-400' : 'border-gray-200'}
                    flex items-center justify-center
                  `}>
                      <span className={`text-2xl md:text-3xl font-bold font-mono ${['?', '☕'].includes(val) ? 'text-gray-500' : 'text-gray-900'}`}>
                        {val}
                      </span>
                  </div>
                </button>
              );
            })}
         </div>
      </div>
    </div>
  );
};