import React, { useRef, useMemo, memo } from 'react';
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
 *
 * Memoized to prevent re-renders when new emoji throws are added to the array.
 * Each throw has unique ID - existing throws shouldn't re-render when new ones appear.
 */
export const EmojiThrow: React.FC<EmojiThrowProps> = memo(({
  throw: throwData,
  fromPosition,
  toPosition,
  onComplete,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const progress = useRef(0);
  const animationDuration = 1.2; // seconds - slightly faster for better feel

  // Calculate control point for bezier curve (creates an arc)
  // Memoize to avoid recalculation every frame
  const controlPoint = useMemo(
    () => new THREE.Vector3(
      (fromPosition.x + toPosition.x) / 2,
      Math.max(fromPosition.y, toPosition.y) + 2, // Arc height
      (fromPosition.z + toPosition.z) / 2
    ),
    [fromPosition, toPosition]
  );

  // Pre-calculate bezier coefficients for better performance
  const bezierCoeffs = useMemo(() => ({
    p0: fromPosition,
    p1: controlPoint,
    p2: toPosition,
  }), [fromPosition, controlPoint, toPosition]);

  useFrame((state, delta) => {
    if (!groupRef.current) return;

    progress.current += delta / animationDuration;

    if (progress.current >= 1) {
      onComplete();
      return;
    }

    // Optimized quadratic bezier curve interpolation
    const t = progress.current;
    const t1 = 1 - t;
    const t1Sq = t1 * t1;
    const tSq = t * t;
    const twoT1T = 2 * t1 * t;

    const x = t1Sq * bezierCoeffs.p0.x + twoT1T * bezierCoeffs.p1.x + tSq * bezierCoeffs.p2.x;
    const y = t1Sq * bezierCoeffs.p0.y + twoT1T * bezierCoeffs.p1.y + tSq * bezierCoeffs.p2.y;
    const z = t1Sq * bezierCoeffs.p0.z + twoT1T * bezierCoeffs.p1.z + tSq * bezierCoeffs.p2.z;

    groupRef.current.position.set(x, y, z);

    // Add rotation for visual interest - slightly faster rotation
    groupRef.current.rotation.y += delta * 4;
    groupRef.current.rotation.z += delta * 2.5;
  });

  return (
    <group
      ref={groupRef}
      position={[fromPosition.x, fromPosition.y, fromPosition.z]}
    >
      <Html transform sprite distanceFactor={8} zIndexRange={[1000, 0]}>
        <div
          className="text-5xl pointer-events-none"
          style={{
            willChange: 'transform',
            filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.5))',
          }}
        >
          {throwData.emoji}
        </div>
      </Html>
    </group>
  );
}, (prevProps, nextProps) => {
  // Only check ID - throws are "fire-and-forget" animations
  // Once mounted, trajectory and callback are captured and shouldn't change
  // This prevents re-renders when new throws are added to the parent array
  return prevProps.throw.id === nextProps.throw.id;
});
