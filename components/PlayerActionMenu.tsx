import React from 'react';
import { Shield, ShieldOff } from 'lucide-react';

interface PlayerActionMenuProps {
  isTargetAdmin: boolean;
  onToggleAdmin: () => void;
  onClose: () => void;
}

/**
 * Hover action menu shown when an admin hovers over another player.
 * Displays actions like Make Admin / Remove Admin.
 */
export const PlayerActionMenu: React.FC<PlayerActionMenuProps> = ({
  isTargetAdmin,
  onToggleAdmin,
  onClose,
}) => {
  return (
    <div
      className="absolute -top-12 left-1/2 transform -translate-x-1/2 z-50 animate-in fade-in zoom-in-95 duration-150"
      onMouseLeave={onClose}
    >
      <div className="bg-gray-900/95 backdrop-blur-md border border-gray-600/50 rounded-lg shadow-2xl p-1 min-w-[140px]">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggleAdmin();
            onClose();
          }}
          className={`
            w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-all
            ${isTargetAdmin
              ? 'text-red-300 hover:bg-red-600/20 hover:text-red-200'
              : 'text-emerald-300 hover:bg-emerald-600/20 hover:text-emerald-200'}
          `}
        >
          {isTargetAdmin ? (
            <>
              <ShieldOff size={16} />
              Remove Admin
            </>
          ) : (
            <>
              <Shield size={16} />
              Make Admin
            </>
          )}
        </button>
      </div>
      {/* Arrow pointing down to player */}
      <div className="absolute left-1/2 transform -translate-x-1/2 -bottom-1 w-2 h-2 bg-gray-900/95 border-r border-b border-gray-600/50 rotate-45" />
    </div>
  );
};
