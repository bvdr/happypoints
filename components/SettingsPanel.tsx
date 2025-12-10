import React, { useState } from 'react';
import { Settings, X } from 'lucide-react';

interface SettingsPanelProps {
  isHost: boolean;
  poopDisabled?: boolean;
  onTogglePoop?: (disabled: boolean) => void;
}

/**
 * Settings panel accessible via cog icon.
 * Host-only settings like poop toggle are shown only to the host.
 */
export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isHost,
  poopDisabled = false,
  onTogglePoop,
}) => {
  const [isOpen, setIsOpen] = useState(false);

  // Only show settings cog for hosts
  if (!isHost) {
    return null;
  }

  return (
    <>
      {/* Settings Button - positioned to the left of weapon selector (host only) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="absolute right-20 bottom-10 bg-gray-800/80 hover:bg-gray-700/90 text-white w-12 h-12 flex items-center justify-center rounded-lg backdrop-blur-md border border-gray-600/50 transition-all transform hover:scale-105 shadow-lg z-10"
        title="Settings"
      >
        <Settings size={20} />
      </button>

      {/* Settings Panel */}
      {isOpen && (
        <>
          {/* Backdrop to close panel */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setIsOpen(false)}
          />

          {/* Panel */}
          <div className="absolute right-20 bottom-24 bg-gray-900/95 backdrop-blur-xl border border-gray-600/50 rounded-xl p-4 shadow-2xl z-40 animate-in slide-in-from-bottom-4 duration-200 min-w-[240px]">
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-700">
              <h3 className="text-white font-semibold flex items-center gap-2">
                <Settings size={18} /> Settings
              </h3>
              <button
                onClick={() => setIsOpen(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            {/* Settings Content */}
            <div className="space-y-4">
              {/* Host-only settings */}
              {isHost && onTogglePoop && (
                <div className="space-y-3">
                  <p className="text-xs text-gray-500 uppercase tracking-wider font-bold">Host Settings</p>

                  {/* Poop Toggle */}
                  <label className="flex items-center justify-between cursor-pointer group">
                    <span className="text-gray-300 text-sm flex items-center gap-2">
                      <span className="text-lg">💩</span>
                      Poop Emoji
                    </span>
                    <button
                      onClick={() => onTogglePoop(!poopDisabled)}
                      className={`relative w-12 h-6 rounded-full transition-colors ${
                        poopDisabled ? 'bg-gray-600' : 'bg-green-600'
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform ${
                          poopDisabled ? 'translate-x-0' : 'translate-x-6'
                        }`}
                      />
                    </button>
                  </label>

                  {poopDisabled && (
                    <p className="text-xs text-pink-400 flex items-center gap-1">
                      <span>🌹</span> Rose is shown instead
                    </p>
                  )}
                </div>
              )}

              {/* Non-host message */}
              {!isHost && (
                <p className="text-gray-500 text-sm text-center py-4">
                  No settings available
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </>
  );
};
