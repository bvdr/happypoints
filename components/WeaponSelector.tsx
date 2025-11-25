import React, { useState } from 'react';

// Available weapons with emojis
export const WEAPONS = [
  { id: 'volleyball', emoji: '🏐', name: 'Volleyball' },
  { id: 'baseball', emoji: '⚾', name: 'Baseball' },
  { id: 'basketball', emoji: '🏀', name: 'Basketball' },
  { id: 'tomato', emoji: '🍅', name: 'Tomato' },
  { id: 'bomb', emoji: '💣', name: 'Bomb' },
  { id: 'money', emoji: '💰', name: 'Money Bag' },
  { id: 'poo', emoji: '💩', name: 'Pile of Poo' },
  { id: 'heart', emoji: '❤️', name: 'Heart' },
  { id: 'fire', emoji: '🔥', name: 'Fire' },
  { id: 'pie', emoji: '🥧', name: 'Pie' },
  { id: 'confetti', emoji: '🎉', name: 'Confetti Popper' },
  { id: 'duck', emoji: '🦆', name: 'Rubber Ducky' },
];

interface WeaponSelectorProps {
  selectedWeapon: string;
  onSelectWeapon: (emoji: string) => void;
}

/**
 * Weapon selector button that opens a panel to choose throwing emojis.
 * Shows the currently selected weapon and allows switching between options.
 */
export const WeaponSelector: React.FC<WeaponSelectorProps> = ({
  selectedWeapon,
  onSelectWeapon,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const currentWeapon = WEAPONS.find(w => w.emoji === selectedWeapon) || WEAPONS[0];

  return (
    <>
      {/* Weapon Selector Button - Bottom Right */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute right-4 bottom-10 bg-gray-800/80 hover:bg-gray-700/90 text-white p-3 rounded-lg backdrop-blur-md border border-gray-600/50 transition-all transform hover:scale-105 shadow-lg z-10"
        title={`Selected Weapon: ${currentWeapon.name}`}
      >
        <span className="text-3xl">{currentWeapon.emoji}</span>
      </button>

      {/* Weapon Selection Panel */}
      {isOpen && (
        <>
          {/* Backdrop to close panel */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-4 bottom-24 bg-gray-900/95 backdrop-blur-xl border border-gray-600/50 rounded-xl p-4 shadow-2xl z-40 animate-in slide-in-from-bottom-4 duration-200">
            <div className="grid grid-cols-4 gap-3">
              {WEAPONS.map((weapon) => (
                <button
                  key={weapon.id}
                  onClick={() => {
                    onSelectWeapon(weapon.emoji);
                    setIsOpen(false);
                  }}
                  className={`
                    p-3 rounded-lg transition-all transform hover:scale-110
                    ${weapon.emoji === selectedWeapon
                      ? 'bg-blue-600 ring-2 ring-white shadow-blue-500/50'
                      : 'bg-gray-800 hover:bg-gray-700'
                    }
                  `}
                  title={weapon.name}
                >
                  <span className="text-3xl">{weapon.emoji}</span>
                </button>
              ))}
            </div>

            {/* Current weapon name */}
            <div className="mt-3 pt-3 border-t border-gray-700 text-center">
              <p className="text-gray-400 text-xs uppercase tracking-wider mb-1">Selected</p>
              <p className="text-white font-semibold">{currentWeapon.name}</p>
            </div>
          </div>
        </>
      )}
    </>
  );
};
