import React, { useState, useEffect } from 'react';

interface LifeBarProps {
  health: number; // 0-100
  maxHealth?: number;
  lastHitTimestamp?: number;
}

/**
 * Health bar component displayed above player avatars.
 * Shows red bar that decreases as health goes down.
 * Fades out after 3 seconds of no hits.
 */
export const LifeBar: React.FC<LifeBarProps> = ({ health, maxHealth = 100, lastHitTimestamp }) => {
  const percentage = Math.max(0, Math.min(100, (health / maxHealth) * 100));
  const [opacity, setOpacity] = useState(1);

  useEffect(() => {
    if (!lastHitTimestamp) {
      setOpacity(0);
      return;
    }

    // Show bar immediately on hit
    setOpacity(1);

    // Calculate time since last hit and fade out after 3 seconds
    const updateOpacity = () => {
      const timeSinceHit = Date.now() - lastHitTimestamp;
      const fadeStartTime = 3000; // Start fading after 3 seconds
      const fadeDuration = 500; // Fade out over 500ms

      if (timeSinceHit < fadeStartTime) {
        setOpacity(1);
      } else if (timeSinceHit < fadeStartTime + fadeDuration) {
        // Gradual fade
        const fadeProgress = (timeSinceHit - fadeStartTime) / fadeDuration;
        setOpacity(1 - fadeProgress);
      } else {
        setOpacity(0);
      }
    };

    // Update opacity every 100ms for smooth fade
    const interval = setInterval(updateOpacity, 100);
    updateOpacity(); // Initial update

    return () => clearInterval(interval);
  }, [lastHitTimestamp]);

  // Color changes based on health level
  const getHealthColor = () => {
    if (percentage > 60) return 'bg-green-500';
    if (percentage > 30) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <div
      className="w-full px-1 mb-1 transition-opacity duration-500"
      style={{ opacity }}
    >
      {/* Container with border */}
      <div className="relative h-2 bg-gray-800 rounded-full border border-gray-600 overflow-hidden shadow-lg">
        {/* Health fill */}
        <div
          className={`absolute top-0 left-0 h-full transition-all duration-300 ${getHealthColor()}`}
          style={{ width: `${percentage}%` }}
        >
          {/* Shine effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white to-transparent opacity-30" />
        </div>

        {/* Glass effect overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent" />
      </div>

      {/* Health text */}
      <div className="text-center text-[10px] font-bold text-white mt-0.5 drop-shadow-md">
        {health} HP
      </div>
    </div>
  );
};
