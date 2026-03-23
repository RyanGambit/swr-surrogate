import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, Text } from '@react-three/drei';
import * as THREE from 'three';
import type { BuildingData, RetrofitMeasure } from '@/types';
import type { PhysicsResult, BuildingPhysicsParams } from '@/types/physics';

// ─── Types ───────────────────────────────────────────────────────────────────

interface BuildingModelProps {
  building: Partial<BuildingData>;
  physicsParams?: BuildingPhysicsParams;
  baselineResult?: PhysicsResult;
  retrofitResult?: PhysicsResult;
  activeMeasures: string[];
  onMeasureToggle?: (measureId: string) => void;
}

interface BuildingDimensions {
  width: number;  // meters
  depth: number;
  height: number;
  stories: number;
  windowWallRatio: number;
}

// ─── Derive building geometry from data ──────────────────────────────────────

function deriveDimensions(building: Partial<BuildingData>, params?: BuildingPhysicsParams): BuildingDimensions {
  const areaSqFt = building.areaSqFt || 10000;
  const stories = building.stories || 2;
  const areaM2 = areaSqFt * 0.0929;
  const floorplate = areaM2 / stories;

  // Use a 1.4:1 aspect ratio for more realistic proportions
  const depth = Math.sqrt(floorplate / 1.4);
  const width = depth * 1.4;
  const ceilingH = params?.ceilingHeight_m || 3.2;
  const height = stories * ceilingH;
  const wwr = building.windowWallRatio || 0.3;

  return { width, depth, height, stories, windowWallRatio: wwr };
}

// ─── Scale factor to fit model in view ───────────────────────────────────────

function useScale(dims: BuildingDimensions): number {
  const maxDim = Math.max(dims.width, dims.depth, dims.height);
  return 7 / maxDim; // normalize to ~7 units for tighter framing
}

// ─── Wall Component with heat-loss coloring ─────────────────────────────────

function Wall({ position, rotation, size, hasInsulation, windowWallRatio, hasNewWindows, heatLossColor }: {
  position: [number, number, number];
  rotation: [number, number, number];
  size: [number, number];
  hasInsulation: boolean;
  windowWallRatio: number;
  hasNewWindows: boolean;
  heatLossColor: string;
}) {
  const wallColor = heatLossColor;
  const windowColor = hasNewWindows ? '#60a5fa' : '#bfdbfe';
  const insThickness = hasInsulation ? 0.15 : 0;

  return (
    <group position={position} rotation={rotation}>
      {/* Main wall */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[size[0], size[1], 0.12]} />
        <meshStandardMaterial color={wallColor} transparent opacity={0.85} />
      </mesh>
      {/* Insulation layer */}
      {hasInsulation && (
        <mesh position={[0, 0, -0.14]}>
          <boxGeometry args={[size[0] + 0.02, size[1] + 0.02, insThickness]} />
          <meshStandardMaterial color="#22c55e" transparent opacity={0.35} />
        </mesh>
      )}
      {/* Windows (grid pattern) */}
      {windowWallRatio > 0 && (
        <WindowGrid
          wallWidth={size[0]}
          wallHeight={size[1]}
          ratio={windowWallRatio}
          color={windowColor}
          hasNewWindows={hasNewWindows}
        />
      )}
    </group>
  );
}

function WindowGrid({ wallWidth, wallHeight, ratio, color, hasNewWindows }: {
  wallWidth: number;
  wallHeight: number;
  ratio: number;
  color: string;
  hasNewWindows: boolean;
}) {
  const cols = Math.max(2, Math.floor(wallWidth / 2));
  const rows = Math.max(1, Math.floor(wallHeight / 3.5));
  const winW = (wallWidth * 0.7) / cols;
  const winH = (wallHeight * ratio * 1.2) / rows;
  const windows: React.ReactElement[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = (c - (cols - 1) / 2) * (wallWidth * 0.8 / cols);
      const y = (r - (rows - 1) / 2) * (wallHeight * 0.7 / rows);
      windows.push(
        <mesh key={`${r}-${c}`} position={[x, y, 0.07]}>
          <boxGeometry args={[winW * 0.8, winH * 0.8, 0.02]} />
          <meshStandardMaterial
            color={color}
            transparent
            opacity={hasNewWindows ? 0.6 : 0.4}
            metalness={hasNewWindows ? 0.5 : 0.1}
            roughness={hasNewWindows ? 0.1 : 0.8}
          />
        </mesh>
      );
    }
  }

  return <>{windows}</>;
}

// ─── R-value Annotation (floating label on wall) ────────────────────────────

function RValueLabel({ position, rotation, beforeR, afterR }: {
  position: [number, number, number];
  rotation: [number, number, number];
  beforeR: string;
  afterR: string;
}) {
  return (
    <group position={position} rotation={rotation}>
      {/* Background panel */}
      <mesh position={[0, 0, 0.02]}>
        <planeGeometry args={[2.2, 0.55]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.88} />
      </mesh>
      {/* Border */}
      <mesh position={[0, 0, 0.015]}>
        <planeGeometry args={[2.3, 0.65]} />
        <meshBasicMaterial color="#22c55e" transparent opacity={0.6} />
      </mesh>
      <Text
        fontSize={0.2}
        color="#15803d"
        anchorX="center"
        anchorY="middle"
        position={[0, 0.08, 0.03]}
        font={undefined}
      >
        {`R-${beforeR} -> R-${afterR}`}
      </Text>
      <Text
        fontSize={0.12}
        color="#64748b"
        anchorX="center"
        anchorY="middle"
        position={[0, -0.14, 0.03]}
        font={undefined}
      >
        Wall Insulation Upgrade
      </Text>
    </group>
  );
}

// ─── Floor Slab Separations ─────────────────────────────────────────────────

function FloorSlabs({ width, depth, height, stories, halfH }: {
  width: number;
  depth: number;
  height: number;
  stories: number;
  halfH: number;
}) {
  const slabs: React.ReactElement[] = [];
  const storyHeight = height / stories;

  for (let i = 0; i <= stories; i++) {
    const y = -halfH + i * storyHeight;
    slabs.push(
      <mesh key={`slab-${i}`} position={[0, y, 0]} castShadow receiveShadow>
        <boxGeometry args={[width + 0.06, 0.15, depth + 0.06]} />
        <meshStandardMaterial color="#94a3b8" />
      </mesh>
    );
    {/* Visible edge band on front and sides for floor line definition */}
    if (i > 0 && i < stories) {
      slabs.push(
        <mesh key={`band-front-${i}`} position={[0, y, depth / 2 + 0.07]} castShadow>
          <boxGeometry args={[width + 0.08, 0.18, 0.02]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      );
      slabs.push(
        <mesh key={`band-back-${i}`} position={[0, y, -depth / 2 - 0.07]} castShadow>
          <boxGeometry args={[width + 0.08, 0.18, 0.02]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      );
      slabs.push(
        <mesh key={`band-left-${i}`} position={[-width / 2 - 0.07, y, 0]} castShadow>
          <boxGeometry args={[0.02, 0.18, depth + 0.08]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      );
      slabs.push(
        <mesh key={`band-right-${i}`} position={[width / 2 + 0.07, y, 0]} castShadow>
          <boxGeometry args={[0.02, 0.18, depth + 0.08]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      );
    }
  }

  return <>{slabs}</>;
}

// ─── Building Entrance ──────────────────────────────────────────────────────

function BuildingEntrance({ width, depth, halfH }: {
  width: number;
  depth: number;
  halfH: number;
}) {
  const doorWidth = Math.min(width * 0.15, 2.0);
  const doorHeight = Math.min(halfH * 0.6, 2.8);

  return (
    <group position={[0, -halfH + doorHeight / 2 + 0.08, depth / 2 + 0.07]}>
      {/* Door recess */}
      <mesh>
        <boxGeometry args={[doorWidth + 0.3, doorHeight + 0.15, 0.06]} />
        <meshStandardMaterial color="#475569" />
      </mesh>
      {/* Double doors */}
      <mesh position={[-doorWidth * 0.26, 0, 0.03]}>
        <boxGeometry args={[doorWidth * 0.45, doorHeight, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.6} />
      </mesh>
      <mesh position={[doorWidth * 0.26, 0, 0.03]}>
        <boxGeometry args={[doorWidth * 0.45, doorHeight, 0.02]} />
        <meshStandardMaterial color="#1e293b" metalness={0.3} roughness={0.6} />
      </mesh>
      {/* Door handles */}
      <mesh position={[-doorWidth * 0.05, 0, 0.06]}>
        <boxGeometry args={[0.04, 0.3, 0.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
      </mesh>
      <mesh position={[doorWidth * 0.05, 0, 0.06]}>
        <boxGeometry args={[0.04, 0.3, 0.04]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.8} roughness={0.2} />
      </mesh>
      {/* Transom window above doors */}
      <mesh position={[0, doorHeight / 2 + 0.2, 0.03]}>
        <boxGeometry args={[doorWidth + 0.2, 0.35, 0.02]} />
        <meshStandardMaterial color="#93c5fd" transparent opacity={0.5} metalness={0.3} />
      </mesh>
      {/* Entrance canopy */}
      <mesh position={[0, doorHeight / 2 + 0.5, 0.5]}>
        <boxGeometry args={[doorWidth + 1.0, 0.08, 1.2]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
    </group>
  );
}

// ─── Mechanical Penthouse on Roof ───────────────────────────────────────────

function MechanicalPenthouse({ width, depth, height }: {
  width: number;
  depth: number;
  height: number;
}) {
  const phWidth = Math.min(width * 0.25, 4);
  const phDepth = Math.min(depth * 0.25, 3);
  const phHeight = 1.5;

  return (
    <group position={[-width * 0.2, height / 2 + 0.1 + phHeight / 2, -depth * 0.15]}>
      {/* Penthouse walls */}
      <mesh castShadow>
        <boxGeometry args={[phWidth, phHeight, phDepth]} />
        <meshStandardMaterial color="#78716c" />
      </mesh>
      {/* Penthouse roof */}
      <mesh position={[0, phHeight / 2 + 0.04, 0]} castShadow>
        <boxGeometry args={[phWidth + 0.15, 0.08, phDepth + 0.15]} />
        <meshStandardMaterial color="#57534e" />
      </mesh>
      {/* Louvers / vents on side */}
      {[-1, 1].map(side => (
        <mesh key={`louver-${side}`} position={[side * phWidth / 2 + side * 0.02, 0.1, 0]}>
          <boxGeometry args={[0.02, phHeight * 0.5, phDepth * 0.6]} />
          <meshStandardMaterial color="#a8a29e" metalness={0.3} />
        </mesh>
      ))}
      {/* Label */}
      <Text
        fontSize={0.18}
        color="#d6d3d1"
        anchorX="center"
        anchorY="middle"
        position={[0, 0.1, phDepth / 2 + 0.02]}
        font={undefined}
      >
        MECH
      </Text>
    </group>
  );
}

// ─── Roof Component ─────────────────────────────────────────────────────────

function Roof({ width, depth, height, hasSolar, solarCapacity }: {
  width: number;
  depth: number;
  height: number;
  hasSolar: boolean;
  solarCapacity: number;
}) {
  const panelCount = hasSolar ? Math.min(Math.floor(solarCapacity / 2), 40) : 0;
  const panels: React.ReactElement[] = [];

  if (hasSolar && panelCount > 0) {
    const cols = Math.ceil(Math.sqrt(panelCount * width / depth));
    const rows = Math.ceil(panelCount / cols);
    const pW = (width * 0.7) / cols;
    const pD = (depth * 0.7) / rows;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (r * cols + c >= panelCount) break;
        // Offset panels to avoid the mechanical penthouse area
        const x = (c - (cols - 1) / 2) * pW + width * 0.1;
        const z = (r - (rows - 1) / 2) * pD + depth * 0.1;
        panels.push(
          <group key={`pv-${r}-${c}`} position={[x, 0.12, z]} rotation={[-0.26, 0, 0]}>
            <mesh castShadow>
              <boxGeometry args={[pW * 0.85, 0.03, pD * 0.85]} />
              <meshStandardMaterial color="#1e3a5f" metalness={0.7} roughness={0.2} />
            </mesh>
            {/* Panel grid lines */}
            <mesh position={[0, 0.02, 0]}>
              <boxGeometry args={[pW * 0.85, 0.005, pD * 0.85]} />
              <meshStandardMaterial color="#2563eb" transparent opacity={0.3} />
            </mesh>
          </group>
        );
      }
    }
  }

  return (
    <group position={[0, height / 2 + 0.05, 0]}>
      {/* Flat roof */}
      <mesh castShadow receiveShadow>
        <boxGeometry args={[width + 0.2, 0.1, depth + 0.2]} />
        <meshStandardMaterial color="#64748b" />
      </mesh>
      {/* Roof edge parapet */}
      {[
        { pos: [0, 0.2, depth / 2 + 0.1] as [number, number, number], size: [width + 0.3, 0.3, 0.08] as [number, number, number] },
        { pos: [0, 0.2, -depth / 2 - 0.1] as [number, number, number], size: [width + 0.3, 0.3, 0.08] as [number, number, number] },
        { pos: [width / 2 + 0.1, 0.2, 0] as [number, number, number], size: [0.08, 0.3, depth + 0.3] as [number, number, number] },
        { pos: [-width / 2 - 0.1, 0.2, 0] as [number, number, number], size: [0.08, 0.3, depth + 0.3] as [number, number, number] },
      ].map((p, i) => (
        <mesh key={`parapet-${i}`} position={p.pos} castShadow>
          <boxGeometry args={p.size} />
          <meshStandardMaterial color="#78716c" />
        </mesh>
      ))}
      {/* Solar panels */}
      {panels}
    </group>
  );
}

// ─── HVAC Equipment on Roof ────────────────────────────────────────────────

function RoofEquipment({ width, depth, height, hasASHP }: {
  width: number;
  depth: number;
  height: number;
  hasASHP: boolean;
}) {
  return (
    <group position={[width * 0.3, height / 2 + 0.2, -depth * 0.3]}>
      {/* Existing RTU */}
      <mesh castShadow>
        <boxGeometry args={[1.2, 0.6, 0.8]} />
        <meshStandardMaterial color={hasASHP ? '#22c55e' : '#6b7280'} />
      </mesh>
      {hasASHP && (
        <>
          {/* Heat pump condenser unit */}
          <mesh position={[-1.8, 0, 0]} castShadow>
            <cylinderGeometry args={[0.4, 0.4, 0.7, 16]} />
            <meshStandardMaterial color="#16a34a" metalness={0.4} />
          </mesh>
          {/* Fan grill */}
          <mesh position={[-1.8, 0.4, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.1, 0.35, 16]} />
            <meshStandardMaterial color="#4ade80" side={THREE.DoubleSide} />
          </mesh>
        </>
      )}
    </group>
  );
}

// ─── Energy Flow Particles ─────────────────────────────────────────────────

function EnergyFlows({ height, baselineGHG, retrofitGHG, hasMeasures }: {
  height: number;
  baselineGHG: number;
  retrofitGHG?: number;
  hasMeasures: boolean;
}) {
  const baselineParticlesRef = useRef<THREE.Points>(null);
  const savingsParticlesRef = useRef<THREE.Points>(null);

  const baselineCount = 20;
  const savingsCount = 30;

  const baselinePositions = useMemo(() => {
    const pos = new Float32Array(baselineCount * 3);
    for (let i = 0; i < baselineCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 0.6;
      pos[i * 3 + 1] = height / 2 + Math.random() * 2.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 0.6;
    }
    return pos;
  }, [height]);

  const savingsPositions = useMemo(() => {
    const pos = new Float32Array(savingsCount * 3);
    for (let i = 0; i < savingsCount; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 1.2;
      pos[i * 3 + 1] = height / 2 + Math.random() * 3.5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 1.2;
    }
    return pos;
  }, [height]);

  const remainingRatio = retrofitGHG !== undefined
    ? Math.max(0, retrofitGHG / Math.max(baselineGHG, 0.01))
    : 1;
  const savingsRatio = 1 - remainingRatio;
  const visibleBaselineCount = hasMeasures ? Math.floor(baselineCount * remainingRatio) : 0;
  const visibleSavingsCount = hasMeasures ? Math.floor(savingsCount * savingsRatio) : 0;

  useFrame((_, delta) => {
    if (!hasMeasures) return;
    if (baselineParticlesRef.current && visibleBaselineCount > 0) {
      const pos = baselineParticlesRef.current.geometry.attributes.position;
      for (let i = 0; i < visibleBaselineCount; i++) {
        const y = pos.getY(i) + delta * 0.8;
        if (y > height / 2 + 3) {
          pos.setY(i, height / 2 + 0.3);
          pos.setX(i, (Math.random() - 0.5) * 0.6);
          pos.setZ(i, (Math.random() - 0.5) * 0.6);
        } else {
          pos.setY(i, y);
        }
      }
      pos.needsUpdate = true;
    }
    if (savingsParticlesRef.current && visibleSavingsCount > 0) {
      const pos = savingsParticlesRef.current.geometry.attributes.position;
      for (let i = 0; i < visibleSavingsCount; i++) {
        const y = pos.getY(i) + delta * 1.8;
        if (y > height / 2 + 4.5) {
          pos.setY(i, height / 2 + 0.5);
          pos.setX(i, (Math.random() - 0.5) * 1.2);
          pos.setZ(i, (Math.random() - 0.5) * 1.2);
        } else {
          pos.setY(i, y);
        }
      }
      pos.needsUpdate = true;
    }
  });

  if (!hasMeasures) return null;

  return (
    <>
      {visibleBaselineCount > 0 && (
        <points ref={baselineParticlesRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[baselinePositions, 3]}
              count={visibleBaselineCount}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.1}
            color="#9ca3af"
            transparent
            opacity={0.35 * remainingRatio}
            sizeAttenuation
          />
        </points>
      )}
      {visibleSavingsCount > 0 && (
        <points ref={savingsParticlesRef}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              args={[savingsPositions, 3]}
              count={visibleSavingsCount}
            />
          </bufferGeometry>
          <pointsMaterial
            size={0.14}
            color="#22c55e"
            transparent
            opacity={0.7}
            sizeAttenuation
          />
        </points>
      )}
    </>
  );
}

// ─── GHG Reduction Ghost Column ─────────────────────────────────────────────

function GHGGhostColumn({ height, width, baselineGHG, retrofitGHG }: {
  height: number;
  width: number;
  baselineGHG: number;
  retrofitGHG: number;
}) {
  const maxColumnH = height * 0.8;
  const baselineH = maxColumnH;
  const retrofitH = maxColumnH * (retrofitGHG / Math.max(baselineGHG, 0.01));
  const reductionPct = Math.round(((baselineGHG - retrofitGHG) / Math.max(baselineGHG, 0.01)) * 100);
  const halfH = height / 2;
  const colX = -width / 2 - 2.5;

  return (
    <group position={[colX, 0, 0]}>
      {/* Ghost baseline column (semi-transparent) */}
      <mesh position={[0, -halfH + baselineH / 2, 0]}>
        <boxGeometry args={[0.6, baselineH, 0.6]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.15} />
      </mesh>
      {/* Wireframe outline of baseline */}
      <mesh position={[0, -halfH + baselineH / 2, 0]}>
        <boxGeometry args={[0.6, baselineH, 0.6]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.3} wireframe />
      </mesh>
      {/* Current retrofit column (solid) */}
      <mesh position={[0, -halfH + retrofitH / 2, 0]}>
        <boxGeometry args={[0.5, retrofitH, 0.5]} />
        <meshStandardMaterial color="#22c55e" transparent opacity={0.7} />
      </mesh>
      {/* Baseline label */}
      <Text
        fontSize={0.18}
        color="#ef4444"
        anchorX="center"
        anchorY="bottom"
        position={[0, -halfH + baselineH + 0.15, 0]}
        font={undefined}
      >
        {`${Math.round(baselineGHG * 10) / 10}t`}
      </Text>
      {/* Retrofit label */}
      <Text
        fontSize={0.18}
        color="#16a34a"
        anchorX="center"
        anchorY="bottom"
        position={[0, -halfH + retrofitH + 0.15, 0]}
        font={undefined}
      >
        {`${Math.round(retrofitGHG * 10) / 10}t`}
      </Text>
      {/* Reduction arrow / label */}
      <Text
        fontSize={0.22}
        color="#15803d"
        anchorX="center"
        anchorY="middle"
        position={[0, -halfH + (baselineH + retrofitH) / 2, 0.5]}
        font={undefined}
      >
        {`-${reductionPct}%`}
      </Text>
      {/* Column label */}
      <Text
        fontSize={0.14}
        color="#64748b"
        anchorX="center"
        anchorY="top"
        position={[0, -halfH - 0.2, 0]}
        font={undefined}
      >
        GHG
      </Text>
    </group>
  );
}

// ─── Label Annotations ────────────────────────────────────────────────────

function EUILabel({ position, label, value, unit }: {
  position: [number, number, number];
  label: string;
  value: number;
  unit: string;
}) {
  return (
    <group position={position}>
      <Text
        fontSize={0.25}
        color="#1e293b"
        anchorX="left"
        anchorY="middle"
        font={undefined}
      >
        {`${label}: ${value} ${unit}`}
      </Text>
    </group>
  );
}

// ─── Improved Ground Plane with Parking & Sidewalk ──────────────────────────

function GroundPlane({ width, depth, halfH }: {
  width: number;
  depth: number;
  halfH: number;
}) {
  const groundY = -halfH - 0.01;
  const parkingW = width * 3.5;
  const parkingD = depth * 3.5;
  const sidewalkInset = 1.2;

  return (
    <group>
      {/* Grass / landscape area (outermost) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.03, 0]} receiveShadow>
        <planeGeometry args={[parkingW + 6, parkingD + 6]} />
        <meshStandardMaterial color="#86efac" />
      </mesh>

      {/* Parking lot surface (asphalt) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.02, 0]} receiveShadow>
        <planeGeometry args={[parkingW, parkingD]} />
        <meshStandardMaterial color="#6b7280" />
      </mesh>

      {/* Parking lines (front of building) */}
      {Array.from({ length: Math.floor(width / 1.5) }).map((_, i) => (
        <mesh key={`pline-${i}`} rotation={[-Math.PI / 2, 0, 0]} position={[
          (i - Math.floor(width / 1.5) / 2) * 1.5,
          groundY - 0.015,
          depth / 2 + 4
        ]}>
          <planeGeometry args={[0.06, 2.5]} />
          <meshStandardMaterial color="#e2e8f0" />
        </mesh>
      ))}

      {/* Sidewalk strip around building */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, groundY - 0.005, 0]} receiveShadow>
        <planeGeometry args={[width + sidewalkInset * 2, depth + sidewalkInset * 2]} />
        <meshStandardMaterial color="#d1d5db" />
      </mesh>

      {/* Building footprint shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0.3, groundY - 0.004, 0.3]}>
        <planeGeometry args={[width * 1.05, depth * 1.05]} />
        <meshStandardMaterial
          color="#1e293b"
          transparent
          opacity={0.08}
        />
      </mesh>

      {/* Sidewalk curb line (subtle) */}
      {[
        [0, groundY + 0.02, depth / 2 + sidewalkInset] as [number, number, number],
        [0, groundY + 0.02, -depth / 2 - sidewalkInset] as [number, number, number],
      ].map((pos, i) => (
        <mesh key={`curb-${i}`} position={pos}>
          <boxGeometry args={[width + sidewalkInset * 2 + 0.2, 0.06, 0.1]} />
          <meshStandardMaterial color="#9ca3af" />
        </mesh>
      ))}
    </group>
  );
}

// ─── Main Building Scene ───────────────────────────────────────────────────

function BuildingScene({
  building, physicsParams, baselineResult, retrofitResult, activeMeasures,
}: Omit<BuildingModelProps, 'onMeasureToggle'>) {
  const dims = deriveDimensions(building, physicsParams);
  const scale = useScale(dims);
  const { width, depth, height, windowWallRatio, stories } = dims;

  const hasInsulation = activeMeasures.includes('insulation');
  const hasNewWindows = activeMeasures.includes('windows');
  const hasASHP = activeMeasures.includes('ashp');
  const hasSolar = activeMeasures.includes('solar_pv');
  const hasLED = activeMeasures.includes('led_upgrade');
  const hasMeasures = activeMeasures.length > 0;

  const solarCapacity = hasSolar && physicsParams
    ? Math.round((physicsParams.envelope.roofArea_m2 * 0.6) / 5)
    : 0;

  const halfW = width / 2;
  const halfD = depth / 2;
  const halfH = height / 2;

  const currentResult = retrofitResult || baselineResult;

  // Heat-loss wall color: without insulation -> warm orange/red tint (heat escaping),
  // with insulation -> cool blue/green tint (heat retained)
  const wallColor = useMemo(() => {
    if (hasInsulation) return '#6db8a0'; // cool green-blue: heat retention
    return '#c9856a'; // warm orange-brown: heat loss
  }, [hasInsulation]);

  return (
    <group scale={[scale, scale, scale]}>
      {/* Ground plane with parking & sidewalk */}
      <GroundPlane width={width} depth={depth} halfH={halfH} />

      {/* Floor slab separations (story-by-story lines) */}
      <FloorSlabs width={width} depth={depth} height={height} stories={stories} halfH={halfH} />

      {/* Walls — 4 faces with heat-loss coloring */}
      <Wall
        position={[0, 0, halfD]}
        rotation={[0, 0, 0]}
        size={[width, height]}
        hasInsulation={hasInsulation}
        windowWallRatio={windowWallRatio}
        hasNewWindows={hasNewWindows}
        heatLossColor={wallColor}
      />
      <Wall
        position={[0, 0, -halfD]}
        rotation={[0, Math.PI, 0]}
        size={[width, height]}
        hasInsulation={hasInsulation}
        windowWallRatio={windowWallRatio}
        hasNewWindows={hasNewWindows}
        heatLossColor={wallColor}
      />
      <Wall
        position={[halfW, 0, 0]}
        rotation={[0, Math.PI / 2, 0]}
        size={[depth, height]}
        hasInsulation={hasInsulation}
        windowWallRatio={windowWallRatio}
        hasNewWindows={hasNewWindows}
        heatLossColor={wallColor}
      />
      <Wall
        position={[-halfW, 0, 0]}
        rotation={[0, -Math.PI / 2, 0]}
        size={[depth, height]}
        hasInsulation={hasInsulation}
        windowWallRatio={windowWallRatio}
        hasNewWindows={hasNewWindows}
        heatLossColor={wallColor}
      />

      {/* Building entrance on front face */}
      <BuildingEntrance width={width} depth={depth} halfH={halfH} />

      {/* R-value annotation on front wall when insulation is active */}
      {hasInsulation && (
        <RValueLabel
          position={[halfW * 0.5, halfH * 0.4, halfD + 0.25]}
          rotation={[0, 0, 0]}
          beforeR="24"
          afterR="31"
        />
      )}

      {/* Roof */}
      <Roof
        width={width}
        depth={depth}
        height={height}
        hasSolar={hasSolar}
        solarCapacity={solarCapacity}
      />

      {/* Mechanical penthouse on roof */}
      <MechanicalPenthouse width={width} depth={depth} height={height} />

      {/* Roof equipment */}
      <RoofEquipment width={width} depth={depth} height={height} hasASHP={hasASHP} />

      {/* LED glow effect inside */}
      {hasLED && (
        <pointLight position={[0, 0, 0]} intensity={0.5} color="#fbbf24" distance={width} />
      )}

      {/* Energy flow / emissions particles — only when measures are active */}
      {baselineResult && (
        <EnergyFlows
          height={height}
          baselineGHG={baselineResult.ghg_tCO2e}
          retrofitGHG={retrofitResult?.ghg_tCO2e}
          hasMeasures={hasMeasures}
        />
      )}

      {/* GHG ghost column comparison (before/after) — only when measures are active */}
      {baselineResult && retrofitResult && hasMeasures && (
        <GHGGhostColumn
          height={height}
          width={width}
          baselineGHG={baselineResult.ghg_tCO2e}
          retrofitGHG={retrofitResult.ghg_tCO2e}
        />
      )}

      {/* Metrics labels */}
      {currentResult && (
        <group position={[halfW + 1.5, halfH * 0.5, 0]}>
          <EUILabel position={[0, 1.2, 0]} label="EUI" value={currentResult.totalEUI_ekWh_m2} unit="ekWh/m\u00B2" />
          <EUILabel position={[0, 0.6, 0]} label="GHG" value={Math.round(currentResult.ghg_tCO2e * 10) / 10} unit="tCO\u2082e" />
          <EUILabel position={[0, 0, 0]} label="Elec" value={Math.round(currentResult.electricity.total_kWh / 1000)} unit="MWh" />
          <EUILabel position={[0, -0.6, 0]} label="Gas" value={Math.round(currentResult.gas.total_m3)} unit="m\u00B3" />
        </group>
      )}

      {/* Ambient + directional light with shadow */}
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[10, 15, 10]}
        intensity={0.8}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-far={50}
        shadow-camera-left={-15}
        shadow-camera-right={15}
        shadow-camera-top={15}
        shadow-camera-bottom={-15}
      />
    </group>
  );
}

// ─── Measure Toggle Panel ──────────────────────────────────────────────────

const MEASURE_LABELS: Record<string, { label: string; color: string }> = {
  led_upgrade: { label: 'LED Lighting', color: '#fbbf24' },
  bas_controls: { label: 'BAS Controls', color: '#8b5cf6' },
  ashp: { label: 'Heat Pump (ASHP)', color: '#22c55e' },
  windows: { label: 'Triple-Glazed Windows', color: '#60a5fa' },
  insulation: { label: 'Exterior Insulation', color: '#4ade80' },
  dhw_heatpump: { label: 'DHW Heat Pump', color: '#14b8a6' },
  solar_pv: { label: 'Rooftop Solar PV', color: '#f59e0b' },
  submetering: { label: 'Smart Submetering', color: '#a78bfa' },
  pipe_insulation: { label: 'Pipe Insulation', color: '#94a3b8' },
  electrical_panel: { label: 'Panel Upgrade', color: '#6b7280' },
};

function MeasureToggles({ activeMeasures, onToggle, availableMeasures }: {
  activeMeasures: string[];
  onToggle: (id: string) => void;
  availableMeasures: string[];
}) {
  return (
    <div className="absolute top-4 left-4 bg-white/90 backdrop-blur rounded-lg shadow-lg p-3 max-w-[200px] z-10">
      <p className="text-xs font-semibold text-slate-700 mb-2 uppercase tracking-wide">Retrofit Measures</p>
      <div className="space-y-1.5">
        {availableMeasures.map(id => {
          const info = MEASURE_LABELS[id] || { label: id, color: '#6b7280' };
          const active = activeMeasures.includes(id);
          return (
            <label key={id} className="flex items-center gap-2 cursor-pointer group">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => onToggle(id)}
                  className="sr-only"
                />
                <div
                  className={`w-4 h-4 rounded border-2 transition-all ${
                    active ? 'border-transparent' : 'border-slate-300 group-hover:border-slate-400'
                  }`}
                  style={active ? { backgroundColor: info.color, borderColor: info.color } : {}}
                >
                  {active && (
                    <svg className="w-3 h-3 text-white mx-auto" viewBox="0 0 12 12">
                      <path d="M3 6l2 2 4-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
              </div>
              <span className={`text-xs ${active ? 'text-slate-900 font-medium' : 'text-slate-600'}`}>
                {info.label}
              </span>
            </label>
          );
        })}
      </div>
    </div>
  );
}

// ─── Baseline vs Retrofit Comparison Panel (replaces ImpactOverlay) ─────────

function ComparisonPanel({ baseline, retrofit }: {
  baseline?: PhysicsResult;
  retrofit?: PhysicsResult;
}) {
  if (!baseline) return null;
  const current = retrofit || baseline;
  const hasRetrofit = !!retrofit;

  const metrics = [
    {
      label: 'EUI',
      unit: 'ekWh/m\u00B2',
      baseVal: baseline.totalEUI_ekWh_m2,
      curVal: current.totalEUI_ekWh_m2,
    },
    {
      label: 'GHG',
      unit: 'tCO\u2082e',
      baseVal: Math.round(baseline.ghg_tCO2e * 10) / 10,
      curVal: Math.round(current.ghg_tCO2e * 10) / 10,
    },
    {
      label: 'Electricity',
      unit: 'MWh',
      baseVal: Math.round(baseline.electricity.total_kWh / 1000),
      curVal: Math.round(current.electricity.total_kWh / 1000),
    },
    {
      label: 'Gas',
      unit: 'm\u00B3',
      baseVal: Math.round(baseline.gas.total_m3),
      curVal: Math.round(current.gas.total_m3),
    },
  ];

  return (
    <div className="absolute bottom-4 left-4 right-4 bg-white/92 backdrop-blur rounded-lg shadow-lg p-3 z-10">
      <div className="grid grid-cols-4 gap-3">
        {metrics.map(m => {
          const diff = m.baseVal - m.curVal;
          const pct = m.baseVal > 0 ? Math.round((diff / m.baseVal) * 100) : 0;
          const improved = diff > 0;
          const worsened = diff < 0;

          return (
            <div key={m.label} className="text-center">
              <p className="text-[10px] text-slate-500 uppercase font-medium">{m.label}</p>
              {hasRetrofit ? (
                <div className="flex items-center justify-center gap-1.5 mt-0.5">
                  <span className="text-[11px] text-slate-400 line-through">{m.baseVal}</span>
                  <span className={`text-sm font-bold ${improved ? 'text-green-700' : worsened ? 'text-red-600' : 'text-slate-900'}`}>
                    {improved ? '\u2193' : worsened ? '\u2191' : ''} {m.curVal}
                  </span>
                </div>
              ) : (
                <p className="text-sm font-bold text-slate-900 mt-0.5">{m.curVal}</p>
              )}
              <p className="text-[9px] text-slate-400">{m.unit}</p>
              {hasRetrofit && diff !== 0 && (
                <p className={`text-[10px] font-medium ${improved ? 'text-green-600' : 'text-red-500'}`}>
                  {improved ? '-' : '+'}{Math.abs(pct)}%
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Exported Component ──────────────────────────────────────────────

export default function BuildingModel({
  building,
  physicsParams,
  baselineResult,
  retrofitResult,
  activeMeasures,
  onMeasureToggle,
}: BuildingModelProps) {
  const availableMeasures = Object.keys(MEASURE_LABELS);

  return (
    <div className="relative w-full h-full min-h-[400px] bg-gradient-to-b from-sky-100 to-slate-100 rounded-xl overflow-hidden">
      {/* 3D Canvas */}
      <Canvas
        camera={{ position: [12, 8, 12], fov: 45 }}
        shadows
        dpr={[1, 2]}
      >
        <BuildingScene
          building={building}
          physicsParams={physicsParams}
          baselineResult={baselineResult}
          retrofitResult={retrofitResult}
          activeMeasures={activeMeasures}
        />
        <OrbitControls
          enablePan={false}
          minDistance={5}
          maxDistance={30}
          maxPolarAngle={Math.PI / 2.1}
        />
      </Canvas>

      {/* UI Overlays */}
      {onMeasureToggle && (
        <MeasureToggles
          activeMeasures={activeMeasures}
          onToggle={onMeasureToggle}
          availableMeasures={availableMeasures}
        />
      )}
      <ComparisonPanel baseline={baselineResult} retrofit={retrofitResult} />
    </div>
  );
}
