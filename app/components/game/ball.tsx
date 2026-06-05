"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useRef } from "react";
import type { Mesh } from "three";
import type { GameRuntime } from "./game-types";

type BallProps = {
  runtimeRef: RefObject<GameRuntime>;
  displayScale: number;
  radius: number;
};

export function Ball({ runtimeRef, displayScale, radius }: BallProps) {
  const meshRef = useRef<Mesh>(null);

  useFrame((_, delta) => {
    const mesh = meshRef.current;
    const runtime = runtimeRef.current;

    if (!mesh || !runtime) {
      return;
    }

    mesh.position.y = runtime.ballY * displayScale;
    mesh.rotation.x += delta * (runtime.isSmashing ? 18 : 5);
    mesh.rotation.z += delta * 3;

    const invinciblePulse = runtime.invincibleSecondsLeft > 0 ? 1.12 : 1;
    const contactSquash = Math.max(0, runtime.contactSeconds / 0.16);

    mesh.scale.set(
      invinciblePulse * (1 + contactSquash * 0.12),
      invinciblePulse * (1 - contactSquash * 0.18),
      invinciblePulse * (1 + contactSquash * 0.12),
    );
  });

  return (
    <mesh ref={meshRef} position={[0, 0, 1.35]} castShadow>
      <sphereGeometry args={[radius, 36, 36]} />
      <meshStandardMaterial
        color="#ff4f36"
        emissive="#ff2f20"
        emissiveIntensity={0.18}
        roughness={0.38}
        metalness={0.08}
      />
    </mesh>
  );
}
