"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useMemo, useRef } from "react";
import {
  ExtrudeGeometry,
  Group,
  MathUtils,
  MeshStandardMaterial,
  Shape,
} from "three";
import type { HelixPlatform, HelixSegment } from "./game-types";
import { CrashBurst } from "./crash-burst";
import type { CrashBurst as CrashBurstType } from "./game-types";

type HelixTowerProps = {
  level: HelixPlatform[];
  destroyedIds: Set<string>;
  crashBursts: CrashBurstType[];
  towerRotationRef: RefObject<number>;
  displayScale: number;
  finishY: number;
};

const OUTER_RADIUS = 2.15;
const INNER_RADIUS = 0.72;
const ROTATION_SPEED = MathUtils.degToRad(55);
const PLATFORM_THICKNESS = 0.28;

function createSegmentGeometry(segment: HelixSegment) {
  const shape = new Shape();
  const start = segment.startAngle;
  const end = segment.endAngle;

  shape.absarc(0, 0, OUTER_RADIUS, start, end, false);
  shape.lineTo(INNER_RADIUS * Math.cos(end), INNER_RADIUS * Math.sin(end));
  shape.absarc(0, 0, INNER_RADIUS, end, start, true);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: PLATFORM_THICKNESS,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    bevelSegments: 2,
    curveSegments: 24,
  });
  geometry.translate(0, 0, -PLATFORM_THICKNESS / 2);
  geometry.computeVertexNormals();

  return geometry;
}

function createFinishGeometry() {
  const shape = new Shape();

  shape.absarc(0, 0, OUTER_RADIUS, 0, Math.PI * 2, false);
  shape.lineTo(INNER_RADIUS * Math.cos(Math.PI * 2), INNER_RADIUS * Math.sin(Math.PI * 2));
  shape.absarc(0, 0, INNER_RADIUS, Math.PI * 2, 0, true);
  shape.closePath();

  const geometry = new ExtrudeGeometry(shape, {
    depth: PLATFORM_THICKNESS,
    bevelEnabled: true,
    bevelSize: 0.035,
    bevelThickness: 0.035,
    bevelSegments: 2,
    curveSegments: 48,
  });

  geometry.translate(0, 0, -PLATFORM_THICKNESS / 2);
  geometry.computeVertexNormals();

  return geometry;
}

function HelixSegmentMesh({
  segment,
  platform,
  destroyed,
}: {
  segment: HelixSegment;
  platform: HelixPlatform;
  destroyed: boolean;
}) {
  const geometry = useMemo(() => createSegmentGeometry(segment), [segment]);
  const material = useMemo(
    () =>
      new MeshStandardMaterial({
        color: segment.kind === "danger" ? "#111827" : platform.color,
        emissive: segment.kind === "danger" ? "#020617" : platform.color,
        emissiveIntensity: segment.kind === "danger" ? 0.08 : 0.04,
        roughness: 0.42,
        metalness: 0.1,
      }),
    [platform.color, segment.kind],
  );

  if (destroyed) {
    return null;
  }

  return (
    <mesh
      geometry={geometry}
      material={material}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
      castShadow
    />
  );
}

export function HelixTower({
  level,
  destroyedIds,
  crashBursts,
  towerRotationRef,
  displayScale,
  finishY,
}: HelixTowerProps) {
  const towerRef = useRef<Group>(null);
  const finishGeometry = useMemo(() => createFinishGeometry(), []);
  const finishMaterial = useMemo(
    () =>
      new MeshStandardMaterial({
        color: "#facc15",
        emissive: "#f59e0b",
        emissiveIntensity: 0.18,
        roughness: 0.36,
        metalness: 0.18,
      }),
    [],
  );
  const highestY = level[0]?.y ?? 0;
  const poleHeight = Math.max(6, Math.abs(highestY - finishY) * displayScale + 5);
  const poleCenterY = ((highestY + finishY) * displayScale) / 2;

  useFrame((_, delta) => {
    const tower = towerRef.current;

    if (!tower) {
      return;
    }

    tower.rotation.y += ROTATION_SPEED * delta;
    towerRotationRef.current = tower.rotation.y;
  });

  return (
    <group ref={towerRef}>
      <mesh position={[0, poleCenterY, 0]} receiveShadow>
        <cylinderGeometry args={[0.22, 0.22, poleHeight, 32]} />
        <meshStandardMaterial color="#f8fafc" roughness={0.36} metalness={0.2} />
      </mesh>

      {level.map((platform) => (
        <group
          key={platform.id}
          position={[0, platform.y * displayScale, 0]}
          rotation={[0, platform.baseRotation, 0]}
        >
          {platform.segments.map((segment) => (
            <HelixSegmentMesh
              key={segment.id}
              segment={segment}
              platform={platform}
              destroyed={destroyedIds.has(platform.id)}
            />
          ))}
        </group>
      ))}

      <mesh
        geometry={finishGeometry}
        material={finishMaterial}
        position={[0, finishY * displayScale, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        receiveShadow
        castShadow
      />

      {crashBursts.map((burst) => (
        <CrashBurst key={burst.id} burst={burst} displayScale={displayScale} />
      ))}
    </group>
  );
}
