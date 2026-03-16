"use client";

import { useMemo, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

type FunnelParticle = {
  theta: number;
  offset: number;
  speed: number;
  radiusJitter: number;
  scale: number;
};

const PARTICLE_COUNT = 220;

function FunnelSwarm() {
  const groupRef = useRef<THREE.Group>(null);
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const ringRef = useRef<THREE.Mesh>(null);
  const coneRef = useRef<THREE.Mesh>(null);
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const particleData = useMemo<FunnelParticle[]>(() => {
    const values: FunnelParticle[] = [];
    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const seed = Math.sin(index * 12.9898) * 43758.5453;
      const random = seed - Math.floor(seed);
      values.push({
        theta: random * Math.PI * 2,
        offset: (index / PARTICLE_COUNT) * 1.2,
        speed: 0.08 + (index % 9) * 0.005,
        radiusJitter: (random - 0.5) * 0.12,
        scale: 0.023 + (index % 5) * 0.003,
      });
    }
    return values;
  }, []);

  useFrame((state) => {
    const elapsed = state.clock.elapsedTime;

    if (groupRef.current) {
      groupRef.current.rotation.y = elapsed * 0.2;
      groupRef.current.rotation.x = Math.sin(elapsed * 0.28) * 0.04;
    }

    if (ringRef.current) {
      ringRef.current.rotation.z = -elapsed * 0.4;
    }

    if (coneRef.current) {
      coneRef.current.rotation.y = elapsed * 0.1;
    }

    if (!particlesRef.current) {
      return;
    }

    for (let index = 0; index < particleData.length; index += 1) {
      const particle = particleData[index];
      const progress = (elapsed * particle.speed + particle.offset) % 1;
      const y = THREE.MathUtils.lerp(2.2, -2.2, progress);
      const radius = THREE.MathUtils.lerp(1.75, 0.2, progress) + particle.radiusJitter;
      const theta = particle.theta + elapsed * 0.55 + progress * 4.1;
      const x = Math.cos(theta) * radius;
      const z = Math.sin(theta) * radius;

      dummy.position.set(x, y, z);
      dummy.scale.setScalar(particle.scale + Math.sin(elapsed * 2 + index * 0.2) * 0.004);
      dummy.updateMatrix();
      particlesRef.current.setMatrixAt(index, dummy.matrix);
    }

    particlesRef.current.instanceMatrix.needsUpdate = true;
  });

  return (
    <group ref={groupRef}>
      <mesh ref={coneRef} rotation={[Math.PI, 0, 0]} position={[0, 0, 0]}>
        <coneGeometry args={[1.8, 4.8, 56, 1, true]} />
        <meshBasicMaterial color="#7be0ff" wireframe transparent opacity={0.22} />
      </mesh>

      <mesh ref={ringRef} rotation={[Math.PI / 2, 0, 0]} position={[0, 1.8, 0]}>
        <torusGeometry args={[1.95, 0.02, 24, 80]} />
        <meshBasicMaterial color="#4f6bff" transparent opacity={0.45} />
      </mesh>

      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, -2.2, 0]}>
        <ringGeometry args={[0.16, 0.6, 40]} />
        <meshBasicMaterial color="#7be0ff" transparent opacity={0.35} side={THREE.DoubleSide} />
      </mesh>

      <instancedMesh ref={particlesRef} args={[undefined, undefined, PARTICLE_COUNT]}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color="#9fd6ff" transparent opacity={0.92} />
      </instancedMesh>
    </group>
  );
}

export function ImmersiveFunnelScene() {
  return (
    <div className="absolute inset-0">
      <Canvas camera={{ position: [0, 0, 8.2], fov: 42 }} dpr={[1, 1.35]} gl={{ antialias: true }}>
        <color attach="background" args={["#061228"]} />
        <fog attach="fog" args={["#061228", 8, 16]} />
        <ambientLight intensity={0.34} />
        <pointLight position={[3, 5, 2]} intensity={19} color="#4f6bff" />
        <pointLight position={[-4, -2, 5]} intensity={12} color="#7be0ff" />
        <pointLight position={[0, 2, -4]} intensity={7} color="#d8e9ff" />
        <FunnelSwarm />
      </Canvas>
    </div>
  );
}
