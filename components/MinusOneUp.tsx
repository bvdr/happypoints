import React from 'react';

/**
 * -1UP animation that floats upward when player is knocked out.
 * Similar to classic fighting game knockouts.
 */
export const MinusOneUp: React.FC = () => {
  return (
    <div
      className="absolute -top-8 left-1/2 -translate-x-1/2 pointer-events-none z-50"
      style={{
        animation: 'float-up-fade 2s ease-out forwards',
      }}
    >
      <div className="text-3xl font-bold text-red-500 drop-shadow-[0_2px_8px_rgba(255,0,0,0.8)] whitespace-nowrap">
        -1UP
      </div>

      <style jsx>{`
        @keyframes float-up-fade {
          0% {
            transform: translate(-50%, 0) scale(0.5);
            opacity: 0;
          }
          20% {
            opacity: 1;
            transform: translate(-50%, -10px) scale(1.2);
          }
          100% {
            transform: translate(-50%, -80px) scale(1);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};
