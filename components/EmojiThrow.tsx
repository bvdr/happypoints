import React, { useEffect, useRef } from 'react';
import { Html } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { EmojiThrow as EmojiThrowType } from '../types';

interface EmojiThrowProps {
  throw: EmojiThrowType;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  onComplete: () => void;
}

/**
 * Component that animates an emoji flying from one player position to another.
 * Uses quadratic bezier curve for a natural arc trajectory.
 */
export const EmojiThrow: React.FC<EmojiThrowProps> = ({
  throw: throwData,
  fromPosition,
  toPosition,
  onComplete,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const progress = useRef(0);
  const animationDuration = 1.5; // seconds

  // Calculate control point for bezier curve (creates an arc)
  const controlPoint = useRef(
    new THREE.Vector3(
      (fromPosition.x + toPosition.x) / 2,
      Math.max(fromPosition.y, toPosition.y) + 2, // Arc height
      (fromPosition.z + toPosition.z) / 2
    )
  );

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    progress.current += delta / animationDuration;

    if (progress.current >= 1) {
      onComplete();
      return;
    }

    // Quadratic bezier curve interpolation
    const t = progress.current;
    const t1 = 1 - t;

    const x = t1 * t1 * fromPosition.x + 2 * t1 * t * controlPoint.current.x + t * t * toPosition.x;
    const y = t1 * t1 * fromPosition.y + 2 * t1 * t * controlPoint.current.y + t * t * toPosition.y;
    const z = t1 * t1 * fromPosition.z + 2 * t1 * t * controlPoint.current.z + t * t * toPosition.z;

    groupRef.current.position.set(x, y, z);

    // Add rotation for visual interest
    groupRef.current.rotation.y += delta * 3;
    groupRef.current.rotation.z += delta * 2;
  });

  return (
    <group ref={groupRef}>
      <Html center distanceFactor={8} zIndexRange={[1000, 0]}>
        <div
          className="text-5xl pointer-events-none"
          style={{
            filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5))',
            opacity: 1,
          }}
        >
          {throwData.emoji}
        </div>
      </Html>
    </group>
  );
};
