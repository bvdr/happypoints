import React, { useRef, useMemo, Suspense } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Environment, ContactShadows, PresentationControls, Html, useProgress } from '@react-three/drei';
import * as THREE from 'three';
import { Player, GameStatus } from '../types';
import { FELT_COLOR, RAIL_COLOR, CARD_BACK_COLOR, CARD_FRONT_COLOR, TABLE_WIDTH, TABLE_DEPTH, FELT_RING_COLOR } from '../constants';

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
  const targetY = position[1];

  useFrame((state) => {
    if (groupRef.current) {
      const floatOffset = Math.sin(state.clock.elapsedTime * 2) * 0.05;
      groupRef.current.position.y = THREE.MathUtils.lerp(
        groupRef.current.position.y, 
        targetY + floatOffset, 
        0.1
      );
      const targetRotX = isRevealed ? Math.PI : 0;
      groupRef.current.rotation.x = THREE.MathUtils.lerp(groupRef.current.rotation.x, targetRotX + rotation[0], 0.1);
    }
  });

  return (
    <group 
      ref={groupRef} 
      position={position} 
      rotation={[rotation[0], rotation[1], rotation[2]]}
    >
        <group>
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
}

const PlayerSeat: React.FC<PlayerSeatProps> = ({ player, position, rotation, status, isMe }) => {
  const avatarUrl = `https://api.dicebear.com/9.x/fun-emoji/svg?seed=${player.name}`;

  // Push cards slightly towards center
  const cardPos: [number, number, number] = [
     position[0] * 0.75, 
     0.2, 
     position[2] * 0.75
  ];
  const cardRot: [number, number, number] = [-Math.PI / 2, rotation[1], 0];

  return (
    <group>
      <Html position={[position[0], 1.5, position[2]]} center transform sprite={false} distanceFactor={15} zIndexRange={[100, 0]}>
        <div className={`flex flex-col items-center transition-all duration-300 ${isMe ? 'scale-110' : 'scale-100'}`}>
          {/* Avatar - Reduced size from w-16 to w-12 */}
          <div className={`
            relative w-12 h-12 rounded-full border-2 shadow-lg mb-1 bg-gray-900 overflow-hidden
            ${isMe ? 'border-white shadow-white/30' : (player.vote ? 'border-emerald-400 shadow-emerald-500/50' : 'border-gray-700')}
          `}>
             <img src={avatarUrl} alt={player.name} className="w-full h-full object-cover" />
          </div>
          
          {/* Name Tag */}
          <div className="bg-gray-900/90 backdrop-blur-md border border-gray-700 text-white rounded px-2 py-0.5 shadow-xl min-w-[60px] text-center">
             <div className="font-bold text-xs truncate max-w-[100px] text-gray-100">{player.name}</div>
          </div>

          {/* Reveal Result - Shown below name */}
          {status === GameStatus.REVEALED && player.vote && (
             <div className="mt-1 bg-blue-600 text-white font-bold text-lg px-2 py-0.5 rounded shadow-lg border border-blue-400 min-w-[2rem] text-center animate-in zoom-in slide-in-from-top-2">
                 {player.vote}
             </div>
          )}
        </div>
      </Html>

      {player.vote && (
        <Card3D 
          value={player.vote}
          position={cardPos}
          rotation={cardRot}
          isRevealed={status === GameStatus.REVEALED}
          isMyCard={isMe}
        />
      )}
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
}

export const Table3D: React.FC<Table3DProps> = ({ players, status, average, myId }) => {
  
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

  const getSeatPosition = (index: number, total: number) => {
    const angle = (index / total) * Math.PI * 2 + Math.PI / 2;
    const radiusX = TABLE_WIDTH / 2 + 1.0; 
    const radiusZ = TABLE_DEPTH / 2 + 1.0;
    
    const x = Math.cos(angle) * radiusX;
    const z = Math.sin(angle) * radiusZ;
    const rotY = -Math.atan2(z, x) - Math.PI / 2;

    return { pos: [x, 0, z] as [number, number, number], rot: [0, rotY, 0] as [number, number, number] };
  };

  return (
    <div className="w-full h-full absolute top-0 left-0 z-0 bg-[#0a0a0a]">
      <Canvas shadows camera={{ position: [0, 12, 10], fov: 30 }}>
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
            
            <PresentationControls
              global
              zoom={0.8}
              rotation={[0, 0, 0]}
              polar={[0, Math.PI / 4]}
              azimuth={[-Math.PI / 4, Math.PI / 4]}
            >
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
                        <group position={[0, 1.5, 0]}>
                            <mesh>
                              <boxGeometry args={[3.8, 0.8, 0.1]} />
                              <meshBasicMaterial color="black" transparent opacity={0.8} />
                            </mesh>
                            <Text position={[0, 0, 0.06]} fontSize={0.35} color="#fbbf24" letterSpacing={0.1} font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff">
                              AVERAGE: {average.toFixed(2)}
                            </Text>
                        </group>
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
                              font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjp-Ek-_EeA.woff"
                          >
                              PLACE YOUR VOTES
                          </Text>
                        </group>
                    )}
                  </group>

                  {/* PLAYERS */}
                  {players.map((player, i) => {
                    const { pos, rot } = getSeatPosition(i, players.length);
                    return (
                        <PlayerSeat
                          key={player.id}
                          player={player}
                          position={pos}
                          rotation={rot}
                          status={status}
                          isMe={player.id === myId}
                        />
                    );
                  })}

              </group>
            </PresentationControls>
            
            <ContactShadows position={[0, -1.05, 0]} opacity={0.6} scale={40} blur={2.5} far={4} color="#000000" />
        </Suspense>
      </Canvas>
    </div>
  );
};