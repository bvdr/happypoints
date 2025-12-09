import React, { useRef, useMemo, Suspense, forwardRef, useImperativeHandle } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Text, Environment, ContactShadows, OrbitControls, Html, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { Player, GameStatus, EmojiThrow as EmojiThrowType } from '../types';
import { FELT_COLOR, RAIL_COLOR, CARD_BACK_COLOR, CARD_FRONT_COLOR, TABLE_WIDTH, TABLE_DEPTH, FELT_RING_COLOR } from '../constants';
import { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { Check } from 'lucide-react';
import { EmojiThrow } from './EmojiThrow';
import { LifeBar } from './LifeBar';
import { MinusOneUp } from './MinusOneUp';
import { VolumetricNumber } from './VolumetricNumber';

export interface Table3DRef {
  resetCamera: () => void;
}

// --- Helpers ---

const createStadiumShape = (width: number, height: number, radius: number) => {
  const halfStraight = Math.max(0, (width - height) / 2);
  const r = radius;

  const s = new THREE.Shape();
  
  // Standard Stadium shape (Capsule)
  // Start right center
  s.absarc(halfStraight, 0, r, -Math.PI / 2, Math.PI / 2, false);
  // Top line is implied by next arc start
  s.absarc(-halfStraight, 0, r, Math.PI / 2, 1.5 * Math.PI, false);
  
  return s;
};

// Procedural Texture for the specific Racetrack look
const generateTableTexture = (width: number, height: number) => {
  const canvas = document.createElement('canvas');
  canvas.width = 2048; 
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    // 1. Fill Background
    ctx.fillStyle = FELT_COLOR;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Texture Generation (Felt Noise)
    // Layer 1: Dark subtle grain
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#000000';
    for (let i = 0; i < 400000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const s = Math.random() * 2;
        ctx.fillRect(x, y, s, s);
    }
    
    // Layer 2: Light subtle highlights for fabric fuzz
    ctx.globalAlpha = 0.05;
    ctx.fillStyle = '#ffffff';
    for (let i = 0; i < 300000; i++) {
        const x = Math.random() * canvas.width;
        const y = Math.random() * canvas.height;
        const s = Math.random() * 2;
        ctx.fillRect(x, y, s, s);
    }
    
    ctx.globalAlpha = 1.0;

    // 3. Draw the Racetrack Line
    const margin = 140; 
    const w = canvas.width;
    const h = canvas.height;
    
    const outerR = h / 2;
    const lineR = outerR - margin; 
    
    const straightL = w - h; 
    const halfStraight = straightL / 2;
    const centerX = w / 2;
    const centerY = h / 2;

    // Add a slight shadow to the line to make it look printed/embedded
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;

    ctx.strokeStyle = FELT_RING_COLOR;
    ctx.lineWidth = 12; 
    
    ctx.beginPath();
    ctx.arc(centerX + halfStraight, centerY, lineR, -Math.PI/2, Math.PI/2, false);
    ctx.arc(centerX - halfStraight, centerY, lineR, Math.PI/2, -Math.PI/2, false);
    ctx.closePath();
    ctx.stroke();

    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    // 4. Subtle Vignette to darken edges slightly
    const grad = ctx.createRadialGradient(centerX, centerY, h * 0.3, centerX, centerY, w * 0.8);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.25)');
    ctx.globalAlpha = 1.0;
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.anisotropy = 16;
  return texture;
};

// --- Sub-Components ---

interface Card3DProps {
  value?: string | null;
  position: [number, number, number];
  rotation: [number, number, number];
  isRevealed: boolean;
  isMyCard: boolean;
}

const Card3D: React.FC<Card3DProps> = ({
  value,
  position,
  rotation,
  isRevealed,
  isMyCard
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const cardRef = useRef<THREE.Group>(null);
  const targetY = position[1];

  useFrame((state) => {
    if (groupRef.current) {
      const floatOffset = Math.sin(state.clock.elapsedTime * 2) * 0.05;
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        targetY + floatOffset,
        0.1
      );
    }

    if (cardRef.current) {
      // Flip the card 180 degrees when revealed
      const targetRotX = isRevealed ? Math.PI : 0;
      cardRef.current.rotation.x = THREE.MathUtils.lerp(cardRef.current.rotation.x, targetRotX, 0.1);
    }
  });

  return (
    <group
      ref={groupRef}
      position={position}
      rotation={[rotation[0], rotation[1], rotation[2]]}
    >
        <group ref={cardRef}>
            {/* Front */}
            <mesh position={[0, 0, 0.005]}>
                <boxGeometry args={[1, 1.4, 0.01]} />
                <meshStandardMaterial color={CARD_FRONT_COLOR} roughness={0.3} />
            </mesh>
            <Text position={[0, 0.1, 0.02]} fontSize={0.6} color="black" anchorX="center" anchorY="middle">
                {value || ''}
            </Text>
            {/* Back */}
            <mesh position={[0, 0, -0.005]}>
                <boxGeometry args={[1, 1.4, 0.01]} />
                <meshStandardMaterial color={CARD_BACK_COLOR} roughness={0.4} />
            </mesh>
             <mesh position={[0, 0, -0.01]}>
                 <planeGeometry args={[0.9, 1.3]} />
                 <meshStandardMaterial color="#60a5fa" roughness={0.8} />
             </mesh>
        </group>
    </group>
  );
};

interface PlayerSeatProps {
  player: Player;
  position: [number, number, number];
  rotation: [number, number, number];
  status: GameStatus;
  isMe: boolean;
  onPlayerClick?: (playerId: string) => void;
}

const PlayerSeat: React.FC<PlayerSeatProps> = ({ player, position, rotation, status, isMe, onPlayerClick }) => {
  const groupRef = useRef<THREE.Group>(null);

  // If player has been hit by 5 poops, show monkey avatar instead of DiceBear
  // Otherwise use SVG format for crisp rendering at any size
  const avatarUrl = player.isMonkey
    ? '/monkey.png'
    : `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${encodeURIComponent(player.id)}&format=svg`;

  const handleClick = () => {
    // Don't allow clicking on yourself or disconnected players
    if (!isMe && !player.isDisconnected && onPlayerClick) {
      onPlayerClick(player.id);
    }
  };

  // Push cards slightly towards center
  const cardPos: [number, number, number] = [
     position[0] * 0.75,
     0.2,
     position[2] * 0.75
  ];
  const cardRot: [number, number, number] = [-Math.PI / 2, rotation[1], 0];

  // Animation for disconnected players: fade to transparent, then elevate and disappear (teleportation effect)
  useFrame(() => {
    if (groupRef.current && player.isDisconnected) {
      // Elevate upward during fade out
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y,
        position[1] + 5, // Float upward
        0.05
      );
    }
  });

  return (
    <group ref={groupRef} position={[position[0], position[1], position[2]]}>
      <Html position={[0, 1.5, 0]} center sprite distanceFactor={8} zIndexRange={[100, 0]}>
        <div
          className={`
            flex flex-col items-center transition-all duration-300 relative
            ${isMe ? 'scale-110' : 'scale-100'}
            ${player.isDisconnected ? 'animate-[fade-out-teleport_3s_ease-in-out_forwards]' : ''}
            ${player.isKnockedOut ? 'animate-[flicker_0.1s_ease-in-out_15]' : ''}
          `}
        >
          {/* -1UP animation when knocked out */}
          {player.isKnockedOut && <MinusOneUp />}

          {/* Life Bar - shown above avatar, fades after 3 seconds */}
          <LifeBar health={player.health} lastHitTimestamp={player.lastHitTimestamp} />
          {/* Avatar - Doubled size: w-16 h-16 (64px) */}
          <div
            className={`
              relative w-16 h-16 rounded-full border-2 shadow-lg mb-1 overflow-hidden
              ${player.isMonkey ? 'bg-transparent border-transparent' : 'bg-gray-900'}
              ${!player.isMonkey && (isMe ? 'border-white shadow-white/30' : (player.vote ? 'border-emerald-400 shadow-emerald-500/50' : 'border-gray-700'))}
              ${player.isDisconnected ? 'opacity-30' : ''}
              ${!isMe && !player.isDisconnected ? 'cursor-pointer hover:scale-110 transition-transform' : ''}
            `}
            onClick={handleClick}
          >
             <img
               src={avatarUrl}
               alt={player.name}
               className="w-full h-full object-cover"
               style={{
                 imageRendering: '-webkit-optimize-contrast',
                 backfaceVisibility: 'hidden',
                 transform: 'translateZ(0)',
                 willChange: 'transform'
               }}
             />
          </div>

          {/* Name Tag - Doubled text size */}
          <div className={`
            bg-gray-900/90 backdrop-blur-md border border-gray-700 text-white rounded px-2 py-1 shadow-xl min-w-[60px] text-center
            ${player.isDisconnected ? 'opacity-30' : ''}
          `}>
             <div className="font-bold text-[0.8rem] truncate max-w-[100px] text-gray-100">{player.name}</div>
          </div>

          {/* Disconnected indicator */}
          {player.isDisconnected && (
            <div className="mt-1 bg-red-600/80 text-white text-xs px-2 py-0.5 rounded shadow-lg border border-red-400">
              Disconnected
            </div>
          )}

          {/* Voting Status - Show special cards (? and ☕) or green checkmark for numeric votes */}
          {status === GameStatus.VOTING && player.vote && !player.isDisconnected && (
             <>
               {player.vote === '?' ? (
                 <div className="mt-1 bg-yellow-500 text-white font-bold text-lg rounded-full w-7 h-7 flex items-center justify-center shadow-lg border-2 border-yellow-300 animate-in zoom-in">
                   ?
                 </div>
               ) : player.vote === '☕' ? (
                 <div className="mt-1 text-3xl animate-in zoom-in">
                   ☕
                 </div>
               ) : (
                 <div className="mt-1 bg-emerald-500 text-white rounded-full p-1 shadow-lg border-2 border-emerald-300 animate-in zoom-in">
                   <Check size={16} strokeWidth={3} />
                 </div>
               )}
             </>
          )}

          {/* Reveal Result - Shown below name when cards are revealed */}
          {status === GameStatus.REVEALED && player.vote && !player.isDisconnected && (
             <div className="mt-1 bg-blue-600 text-white font-bold text-lg px-2 py-0.5 rounded shadow-lg border border-blue-400 min-w-[2rem] text-center animate-in zoom-in slide-in-from-top-2">
                 {player.vote}
             </div>
          )}
        </div>
      </Html>

      {/* 3D cards removed - votes shown in UI badges only */}
    </group>
  );
};

function Loader() {
  const { progress } = useProgress()
  return <Html center><span className="text-white text-lg font-mono">{progress.toFixed(0)}%</span></Html>
}

// --- Main Table Component ---

interface Table3DProps {
  players: Player[];
  status: GameStatus;
  average: number | null;
  myId: string;
  emojiThrows: EmojiThrowType[];
  onThrowEmoji: (targetPlayerId: string) => void;
  onEmojiThrowComplete: (throwId: string) => void;
}

// Camera animation component
const CameraController = forwardRef<{ resetCamera: () => void }>((props, ref) => {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsImpl>(null);
  const isAnimating = useRef(false);
  const targetPosition = useRef(new THREE.Vector3(0, 9, 13));
  const targetTarget = useRef(new THREE.Vector3(0, 0, 0));

  useImperativeHandle(ref, () => ({
    resetCamera: () => {
      isAnimating.current = true;
      targetPosition.current.set(0, 9, 13);
      targetTarget.current.set(0, 0, 0);
    }
  }));

  useFrame(() => {
    if (isAnimating.current && controlsRef.current) {
      // Smoothly interpolate camera position
      camera.position.lerp(targetPosition.current, 0.1);
      controlsRef.current.target.lerp(targetTarget.current, 0.1);

      // Check if close enough to stop animating
      if (camera.position.distanceTo(targetPosition.current) < 0.01) {
        isAnimating.current = false;
        camera.position.copy(targetPosition.current);
        controlsRef.current.target.copy(targetTarget.current);
      }

      controlsRef.current.update();
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false}
      enableZoom={false}
      enableDamping
      dampingFactor={0.05}
    />
  );
});

export const Table3D = forwardRef<Table3DRef, Table3DProps>(({ players, status, average, myId, emojiThrows, onThrowEmoji, onEmojiThrowComplete }, ref) => {
  const cameraControllerRef = useRef<{ resetCamera: () => void }>(null);

  useImperativeHandle(ref, () => ({
    resetCamera: () => {
      cameraControllerRef.current?.resetCamera();
    }
  }));

  const { feltShape, railShape, feltTexture } = useMemo(() => {
    const width = TABLE_WIDTH;
    const depth = TABLE_DEPTH;
    const radius = depth / 2;
    const railWidth = 0.8;

    const feltShape = createStadiumShape(width, depth, radius);
    const railShape = createStadiumShape(width + railWidth * 2, depth + railWidth * 2, radius + railWidth);

    const texture = generateTableTexture(width, depth);
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);

    return { feltShape, railShape, feltTexture: texture };
  }, []);

  // Reorder players array so current player is always at bottom (index 0)
  // This rotates the view without changing the actual join order
  const reorderedPlayers = useMemo(() => {
    const myIndex = players.findIndex(p => p.id === myId);
    if (myIndex === -1) return players;

    // Rotate array so current player is first
    return [...players.slice(myIndex), ...players.slice(0, myIndex)];
  }, [players, myId]);

  const getSeatPosition = (index: number, total: number) => {
    // Start from bottom center (Math.PI/2 makes bottom = 0 index)
    const angle = (index / total) * Math.PI * 2 + Math.PI / 2;
    const radiusX = TABLE_WIDTH / 2 + 1.0;
    const radiusZ = TABLE_DEPTH / 2 + 1.0;

    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    const rotY = -Math.atan2(z, x) - Math.PI / 2;

    return { pos: [x, 0, z] as [number, number, number], rot: [0, rotY, 0] as [number, number, number] };
  };

  // Build a map of player positions for emoji trajectory calculations
  const playerPositions = useMemo(() => {
    const positions = new Map<string, THREE.Vector3>();
    reorderedPlayers.forEach((player, i) => {
      const { pos } = getSeatPosition(i, reorderedPlayers.length);
      // Avatar position is slightly elevated (y = 1.5) to match PlayerSeat Html positioning
      positions.set(player.id, new THREE.Vector3(pos[0], 1.5, pos[2]));
    });
    return positions;
  }, [reorderedPlayers]);

  return (
    <div className="w-full h-full absolute top-0 left-0 z-0 bg-[#0a0a0a]">
      <Canvas shadows camera={{ position: [0, 9, 13], fov: 30 }}>
        <color attach="background" args={['#0a0a0a']} />
        
        {/* --- RADICAL LIGHTING SETUP --- */}
        
        {/* 1. Base Ambient Light - High Intensity to prevent blacks */}
        <ambientLight intensity={1.5} color="#ffffff" />
        
        {/* 2. Hemisphere Light - Natural gradients */}
        <hemisphereLight intensity={1.0} color="#ffffff" groundColor="#444444" />

        {/* 3. Central Spot Light - The main "Table" light */}
        <spotLight 
          position={[0, 15, 0]} 
          angle={0.6} 
          penumbra={0.5} 
          intensity={5.0} 
          castShadow 
          shadow-bias={-0.0001}
          color="#ffffff"
        />
        
        {/* 4. Directional Fill - Replaces RectAreaLight for stability */}
        <directionalLight
          color="#d1fae5" // Very pale green tint
          intensity={2.0}
          position={[0, 10, 5]}
        />
        
        <Suspense fallback={<Loader />}>
            <Environment preset="studio" blur={1} />

            <CameraController ref={cameraControllerRef} />

            <group position={[0, -1, 0]}>
                  
                  {/* RAIL */}
                  <mesh receiveShadow castShadow position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <extrudeGeometry 
                        args={[railShape, { depth: 0.5, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.15, bevelSegments: 8 }]} 
                    />
                    <meshStandardMaterial 
                      color={RAIL_COLOR} 
                      roughness={0.4} 
                      metalness={0.2} 
                    />
                  </mesh>

                  {/* FELT - Emissive added for visibility */}
                  <mesh receiveShadow position={[0, 0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
                    <extrudeGeometry args={[feltShape, { depth: 0.02, bevelEnabled: false }]} />
                    <meshStandardMaterial 
                        map={feltTexture} 
                        color="#ffffff"
                        emissive={FELT_COLOR}
                        emissiveIntensity={0.4}
                        roughness={0.5}
                        metalness={0.1}
                    />
                  </mesh>

                  {/* STATUS PILL */}
                  <group position={[0, 0.24, 0]}>
                    {status === GameStatus.REVEALED && average !== null ? (
                        <VolumetricNumber value={average} />
                    ) : (
                        <group>
                           {/* Flat text on table */}
                          <Text
                              position={[0, 0.02, 0]}
                              rotation={[-Math.PI/2, 0, 0]}
                              fontSize={0.3}
                              color="#a7f3d0"
                              letterSpacing={0.2}
                              fillOpacity={0.6}
                          >
                              PLACE YOUR VOTES
                          </Text>
                        </group>
                    )}
                  </group>

                  {/* PLAYERS */}
                  {reorderedPlayers.map((player, i) => {
                    const { pos, rot } = getSeatPosition(i, reorderedPlayers.length);
                    return (
                        <PlayerSeat
                          key={player.id}
                          player={player}
                          position={pos}
                          rotation={rot}
                          status={status}
                          isMe={player.id === myId}
                          onPlayerClick={onThrowEmoji}
                        />
                    );
                  })}

                  {/* EMOJI THROWS */}
                  {emojiThrows.map((throwData) => {
                    const fromPos = playerPositions.get(throwData.fromPlayerId);
                    const toPos = playerPositions.get(throwData.toPlayerId);

                    // Only render if both positions exist
                    if (!fromPos || !toPos) return null;

                    return (
                      <EmojiThrow
                        key={throwData.id}
                        throw={throwData}
                        fromPosition={fromPos}
                        toPosition={toPos}
                        onComplete={() => onEmojiThrowComplete(throwData.id)}
                      />
                    );
                  })}

              </group>

            <ContactShadows position={[0, -1.05, 0]} opacity={0.6} scale={40} blur={2.5} far={4} color="#000000" />
        </Suspense>
      </Canvas>
    </div>
  );
});