"use client";

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import { Group } from "three";
import type { CrashBurst as CrashBurstType } from "./game-types";

type CrashBurstProps = {
  burst: CrashBurstType;
  displayScale: number;
};

const PARTICLE_COUNT = 14;

function seeded(seed: number, index: number) {
  const value = Math.sin(seed * 928.21 + index * 119.73) * 10000;

  return value - Math.floor(value);
}

export function CrashBurst({ burst, displayScale }: CrashBurstProps) {
  const groupRef = useRef<Group>(null);
  const elapsedRef = useRef(burst.age);
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const angle = (index / PARTICLE_COUNT) * Math.PI * 2;
        const speed = 1.1 + seeded(burst.seed, index) * 1.4;
        const lift = 0.18 + seeded(burst.seed, index + 20) * 0.5;

        return {
          angle,
          speed,
          lift,
          size: 0.06 + seeded(burst.seed, index + 40) * 0.08,
        };
      }),
    [burst.seed],
  );

  useFrame((_, delta) => {
    const group = groupRef.current;

    if (!group) {
      return;
    }

    elapsedRef.current += delta;
    const age = Math.min(1, elapsedRef.current / 0.58);

    group.rotation.y += delta * 8;

    particles.forEach((particle, index) => {
      const child = group.children[index];

      if (!child) {
        return;
      }

      const distance = particle.speed * age;

      child.position.set(
        Math.cos(particle.angle) * distance,
        particle.lift * Math.sin(age * Math.PI),
        Math.sin(particle.angle) * distance,
      );
      child.rotation.set(age * 6, age * 8, age * 4);
      child.scale.setScalar(Math.max(0, 1 - age));
    });
  });

  return (
    <group ref={groupRef} position={[0, burst.y * displayScale, 0]}>
      {particles.map((particle, index) => {
        return (
          <mesh
            key={`${burst.id}-${index}`}
            castShadow
          >
            <boxGeometry args={[particle.size, particle.size * 0.55, particle.size]} />
            <meshStandardMaterial
              color={burst.color}
              emissive={burst.color}
              emissiveIntensity={0.12}
              roughness={0.5}
            />
          </mesh>
        );
      })}
    </group>
  );
}
