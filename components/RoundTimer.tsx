import React, { useEffect, useRef, useState } from 'react';
import { Timer } from 'lucide-react';
import { playCountdownTick } from '../utils/sounds';

// Re-read the clock several times a second so the display never lags a full
// second behind, without leaning on requestAnimationFrame
const TICK_INTERVAL_MS = 250;
// Seconds remaining at which the countdown turns red and starts beeping
const URGENT_SECONDS = 10;

interface RoundTimerProps {
  /** Epoch ms at which the round auto-reveals (server clock) */
  deadline: number;
  /** serverNow - Date.now(), so a skewed local clock still agrees with everyone */
  clockOffsetMs?: number;
}

const formatRemaining = (secondsLeft: number): string => {
  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

/**
 * Compact m:ss countdown to the server-set round deadline.
 * Beeps once per second over the final URGENT_SECONDS (honours the mute toggle).
 */
export const RoundTimer: React.FC<RoundTimerProps> = ({ deadline, clockOffsetMs = 0 }) => {
  const [remainingMs, setRemainingMs] = useState(() =>
    Math.max(0, deadline - (Date.now() + clockOffsetMs))
  );
  // Last `deadline:second` we beeped on. Keyed to the deadline as well as the
  // second so a remount (StrictMode, a late joiner) can't re-beep the same tick
  const lastBeepSecondRef = useRef<string | null>(null);

  useEffect(() => {
    const update = () => setRemainingMs(Math.max(0, deadline - (Date.now() + clockOffsetMs)));
    update();

    const interval = setInterval(update, TICK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [deadline, clockOffsetMs]);

  const secondsLeft = Math.ceil(remainingMs / 1000);
  const isUrgent = secondsLeft <= URGENT_SECONDS;

  useEffect(() => {
    // Beep on 10, 9, … 1 — never on 0, which is the reveal itself
    if (secondsLeft > URGENT_SECONDS || secondsLeft < 1) return;

    const beepKey = `${deadline}:${secondsLeft}`;
    if (lastBeepSecondRef.current === beepKey) return;

    lastBeepSecondRef.current = beepKey;
    playCountdownTick();
  }, [deadline, secondsLeft]);

  return (
    <div
      className={`absolute top-24 left-1/2 transform -translate-x-1/2 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-xl border shadow-2xl backdrop-blur-xl z-50 transition-colors ${
        isUrgent
          ? 'bg-red-950/90 text-red-200 border-red-500/60 animate-pulse'
          : 'bg-black/70 text-gray-200 border-gray-600/50'
      }`}
      title="Time left before votes are revealed"
    >
      <Timer size={16} />
      <span className="font-mono font-bold text-xl tabular-nums tracking-tight">
        {formatRemaining(secondsLeft)}
      </span>
    </div>
  );
};
