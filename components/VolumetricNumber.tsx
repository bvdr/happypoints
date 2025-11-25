import React, { useRef, useEffect, useState } from 'react';
import { Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface VolumetricNumberProps {
  value: number | null;
  onCountdownComplete?: () => void;
}

/**
 * VolumetricNumber displays a 3D countdown (3, 2, 1) followed by the average number
 * with a dramatic reveal animation. The number appears volumetric with depth and glow.
 */
export const VolumetricNumber: React.FC<VolumetricNumberProps> = ({ value, onCountdownComplete }) => {
  const groupRef = useRef<THREE.Group>(null);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [showNumber, setShowNumber] = useState(false);
  const [scale, setScale] = useState(0);

  // Countdown sequence: 3 -> 2 -> 1 -> show number
  useEffect(() => {
    if (value === null) {
      setCountdown(null);
      setShowNumber(false);
      setScale(0);
      return;
    }

    // Start countdown
    setCountdown(3);
    setShowNumber(false);

    const timer1 = setTimeout(() => setCountdown(2), 600);
    const timer2 = setTimeout(() => setCountdown(1), 1200);
    const timer3 = setTimeout(() => {
      setCountdown(null);
      setShowNumber(true);
      onCountdownComplete?.();
    }, 1800);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [value, onCountdownComplete]);

  // Animate scale for pop-in effect
  useFrame(() => {
    if (showNumber && scale < 1) {
      setScale((prev) => Math.min(prev + 0.05, 1));
    }

    // Add subtle floating animation
    if (groupRef.current && showNumber) {
      groupRef.current.position.y = Math.sin(Date.now() * 0.002) * 0.1 + 1.8;
    }

    // Pulsing effect for countdown
    if (groupRef.current && countdown !== null) {
      const pulse = Math.sin(Date.now() * 0.01) * 0.1 + 0.9;
      groupRef.current.scale.set(pulse, pulse, pulse);
    } else if (groupRef.current && showNumber) {
      // Reset scale for number display, but keep our animated scale
      groupRef.current.scale.set(scale, scale, scale);
    }
  });

  const displayValue = countdown !== null ? countdown.toString() : value?.toFixed(1) || '';

  if (!countdown && !showNumber) return null;

  return (
    <group ref={groupRef} position={[0, 1.8, 0]}>
      {/* Multiple layers for volumetric depth effect */}

      {/* Back shadow layer - creates depth */}
      <Text
        position={[0.15, -0.15, -0.3]}
        fontSize={countdown !== null ? 1.5 : 2.1}
        color="#000000"
        anchorX="center"
        anchorY="middle"
        fillOpacity={0.6}
        outlineWidth={0}
      >
        {displayValue}
      </Text>

      {/* Middle glow layer */}
      <Text
        position={[0, 0, -0.15]}
        fontSize={countdown !== null ? 1.5 : 2.1}
        color={countdown !== null ? "#fbbf24" : "#3b82f6"}
        anchorX="center"
        anchorY="middle"
        fillOpacity={0.8}
        outlineWidth={0.2}
        outlineColor="#ffffff"
        outlineOpacity={0.5}
      >
        {displayValue}
      </Text>

      {/* Front main layer - bright and crisp */}
      <Text
        position={[0, 0, 0]}
        fontSize={countdown !== null ? 1.5 : 2.1}
        color={countdown !== null ? "#fbbf24" : "#60a5fa"}
        anchorX="center"
        anchorY="middle"
        fillOpacity={1.0}
        outlineWidth={0.15}
        outlineColor="#ffffff"
        outlineOpacity={0.9}
      >
        {displayValue}
      </Text>

      {/* Highlight layer for extra shimmer */}
      <Text
        position={[-0.05, 0.05, 0.1]}
        fontSize={countdown !== null ? 1.5 : 2.1}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fillOpacity={0.4}
        outlineWidth={0}
      >
        {displayValue}
      </Text>

      {/* Particle ring effect for number reveal */}
      {showNumber && (
        <group>
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const radius = 1.5;
            return (
              <mesh
                key={i}
                position={[
                  Math.cos(angle) * radius,
                  Math.sin(angle) * radius,
                  0
                ]}
              >
                <sphereGeometry args={[0.08, 8, 8]} />
                <meshBasicMaterial
                  color="#60a5fa"
                  transparent
                  opacity={0.6}
                />
              </mesh>
            );
          })}
        </group>
      )}
    </group>
  );
};
