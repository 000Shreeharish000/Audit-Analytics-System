"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Canvas, useFrame } from "@react-three/fiber";
import { MeshTransmissionMaterial } from "@react-three/drei";
import { AnimatePresence, motion, useScroll, useTransform, type MotionValue } from "framer-motion";
import { ArrowDown, ArrowRight } from "lucide-react";
import * as THREE from "three";

type CloudData = {
  brain: Float32Array;
  graph: Float32Array;
  links: Array<[number, number]>;
  riskIndices: Set<number>;
};

const NODE_COUNT = 170;

function seededValue(seed: number): number {
  const raw = Math.sin(seed * 12.9898) * 43758.5453123;
  return raw - Math.floor(raw);
}

function buildCloudData(): CloudData {
  const brain = new Float32Array(NODE_COUNT * 3);
  const graph = new Float32Array(NODE_COUNT * 3);
  const links: Array<[number, number]> = [];
  const riskIndices = new Set<number>();

  for (let i = 0; i < NODE_COUNT; i += 1) {
    const r1 = seededValue(i * 3 + 1);
    const r2 = seededValue(i * 3 + 2);
    const r3 = seededValue(i * 3 + 3);

    const theta = r1 * Math.PI * 2;
    const phi = Math.acos(r2 * 2 - 1);
    const radius = 1.05 + r3 * 0.52;

    const x = radius * Math.sin(phi) * Math.cos(theta) * 0.82;
    const y = radius * Math.sin(phi) * Math.sin(theta) * 0.92;
    const z = radius * Math.cos(phi) * 1.25;
    const hemiOffset = x >= 0 ? 0.16 : -0.16;

    brain[i * 3] = x + hemiOffset;
    brain[i * 3 + 1] = y;
    brain[i * 3 + 2] = z;

    const ring = Math.floor(i / 26);
    const inRing = i % 26;
    const ringRadius = 1.3 + ring * 0.32;
    const ringTheta = (inRing / 26) * Math.PI * 2;
    const layerY = (ring - 4) * 0.58;

    graph[i * 3] = Math.cos(ringTheta) * ringRadius;
    graph[i * 3 + 1] = layerY;
    graph[i * 3 + 2] = Math.sin(ringTheta) * ringRadius;

    if (i % 17 === 0 || i % 29 === 0) {
      riskIndices.add(i);
    }

    links.push([i, (i + 1) % NODE_COUNT]);
    links.push([i, (i + 11) % NODE_COUNT]);
    if (i % 6 === 0) {
      links.push([i, (i + 37) % NODE_COUNT]);
    }
  }

  return { brain, graph, links, riskIndices };
}

function ComplianceBrain({ morph }: { morph: MotionValue<number> }) {
  const groupRef = useRef<THREE.Group>(null);
  const lineRef = useRef<THREE.LineSegments>(null);
  const nodeRef = useRef<THREE.InstancedMesh>(null);
  const glowRef = useRef<THREE.InstancedMesh>(null);
  const lineMaterialRef = useRef<THREE.LineBasicMaterial>(null);
  const shellRef = useRef<THREE.Mesh>(null);

  const { brain, graph, links, riskIndices } = useMemo(() => buildCloudData(), []);
  const linePositionsRef = useRef<Float32Array>(new Float32Array(links.length * 6));
  const transitionRef = useRef(0);
  const nodeDummy = useMemo(() => new THREE.Object3D(), []);
  const glowDummy = useMemo(() => new THREE.Object3D(), []);
  const lineGeometryRef = useRef<THREE.BufferGeometry | null>(null);
  const normalNodeColor = useMemo(() => new THREE.Color("#b2c1ff"), []);
  const riskNodeColor = useMemo(() => new THREE.Color("#ff4d4f"), []);
  const normalGlowColor = useMemo(() => new THREE.Color("#7be0ff"), []);
  const riskGlowColor = useMemo(() => new THREE.Color("#ff4d4f"), []);

  useEffect(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(linePositionsRef.current, 3));
    lineGeometryRef.current = geometry;
    if (lineRef.current) {
      lineRef.current.geometry.dispose();
      lineRef.current.geometry = geometry;
    }
    return () => {
      geometry.dispose();
    };
  }, []);

  useFrame((state, delta) => {
    transitionRef.current = THREE.MathUtils.damp(transitionRef.current, morph.get(), 4.2, delta);
    const t = THREE.MathUtils.clamp(transitionRef.current, 0, 1);

    if (groupRef.current) {
      groupRef.current.rotation.y = state.clock.elapsedTime * (0.1 - t * 0.05);
      groupRef.current.rotation.x = t * 0.16;
      groupRef.current.position.y = 0.32 + Math.sin(state.clock.elapsedTime * 0.8) * 0.05 - t * 0.08;
      groupRef.current.scale.setScalar(1 + t * 0.08);
    }

    if (lineMaterialRef.current) {
      lineMaterialRef.current.opacity = THREE.MathUtils.lerp(0.12, 0.38, t);
    }
    const shellMaterial = shellRef.current?.material;
    if (shellMaterial && !Array.isArray(shellMaterial) && "opacity" in shellMaterial) {
      (shellMaterial as THREE.Material & { opacity: number }).opacity = THREE.MathUtils.lerp(0.58, 0.1, t);
    }

    if (!nodeRef.current || !glowRef.current) {
      return;
    }

    for (let i = 0; i < NODE_COUNT; i += 1) {
      const x = THREE.MathUtils.lerp(brain[i * 3], graph[i * 3], t);
      const y =
        THREE.MathUtils.lerp(brain[i * 3 + 1], graph[i * 3 + 1], t) +
        Math.sin(state.clock.elapsedTime * 1.3 + i * 0.17) * 0.04;
      const z = THREE.MathUtils.lerp(brain[i * 3 + 2], graph[i * 3 + 2], t);

      const isRisk = t > 0.46 && riskIndices.has(i);
      const spinBlend = THREE.MathUtils.clamp((t - 0.65) / 0.35, 0, 1);
      const spinRate = (0.8 + (i % 7) * 0.08) * spinBlend;

      nodeDummy.position.set(x, y, z);
      nodeDummy.rotation.set(
        state.clock.elapsedTime * spinRate * 0.7,
        state.clock.elapsedTime * spinRate,
        state.clock.elapsedTime * spinRate * 0.55,
      );
      nodeDummy.scale.setScalar(isRisk ? 0.09 : 0.066);
      nodeDummy.updateMatrix();
      nodeRef.current.setMatrixAt(i, nodeDummy.matrix);
      nodeRef.current.setColorAt(i, isRisk ? riskNodeColor : normalNodeColor);

      glowDummy.position.set(x, y, z);
      glowDummy.scale.setScalar(isRisk ? 0.22 : 0.14);
      glowDummy.updateMatrix();
      glowRef.current.setMatrixAt(i, glowDummy.matrix);
      glowRef.current.setColorAt(i, isRisk ? riskGlowColor : normalGlowColor);
    }

    let cursor = 0;
    for (const [sourceIdx, targetIdx] of links) {
      linePositionsRef.current[cursor] = THREE.MathUtils.lerp(brain[sourceIdx * 3], graph[sourceIdx * 3], t);
      linePositionsRef.current[cursor + 1] = THREE.MathUtils.lerp(brain[sourceIdx * 3 + 1], graph[sourceIdx * 3 + 1], t);
      linePositionsRef.current[cursor + 2] = THREE.MathUtils.lerp(brain[sourceIdx * 3 + 2], graph[sourceIdx * 3 + 2], t);
      linePositionsRef.current[cursor + 3] = THREE.MathUtils.lerp(brain[targetIdx * 3], graph[targetIdx * 3], t);
      linePositionsRef.current[cursor + 4] = THREE.MathUtils.lerp(brain[targetIdx * 3 + 1], graph[targetIdx * 3 + 1], t);
      linePositionsRef.current[cursor + 5] = THREE.MathUtils.lerp(brain[targetIdx * 3 + 2], graph[targetIdx * 3 + 2], t);
      cursor += 6;
    }

    const lineGeometry = lineRef.current?.geometry;
    const positionAttr = lineGeometry?.getAttribute("position");
    if (positionAttr && "needsUpdate" in positionAttr) {
      (positionAttr as THREE.BufferAttribute).needsUpdate = true;
    }
    nodeRef.current.instanceMatrix.needsUpdate = true;
    glowRef.current.instanceMatrix.needsUpdate = true;
    if (nodeRef.current.instanceColor) {
      nodeRef.current.instanceColor.needsUpdate = true;
    }
    if (glowRef.current.instanceColor) {
      glowRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <group ref={groupRef}>
      <lineSegments ref={lineRef} frustumCulled={false}>
        <lineBasicMaterial ref={lineMaterialRef} color="#7be0ff" transparent opacity={0.16} />
      </lineSegments>

      <instancedMesh ref={glowRef} args={[undefined, undefined, NODE_COUNT]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial transparent opacity={0.24} blending={THREE.AdditiveBlending} toneMapped={false} />
      </instancedMesh>

      <instancedMesh ref={nodeRef} args={[undefined, undefined, NODE_COUNT]} frustumCulled={false}>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.2} metalness={0.86} emissive="#0f1114" emissiveIntensity={0.22} />
      </instancedMesh>

      <mesh ref={shellRef}>
        <sphereGeometry args={[2.35, 36, 36]} />
        <MeshTransmissionMaterial
          samples={2}
          resolution={128}
          thickness={0.44}
          roughness={0.12}
          chromaticAberration={0.02}
          clearcoat={1}
          attenuationDistance={1}
          attenuationColor="#dbe6ff"
          color="#c8d9ff"
          transparent
          opacity={0.56}
          backside
        />
      </mesh>
    </group>
  );
}

export function LandingSceneBackdrop() {
  const [sceneReady, setSceneReady] = useState(false);
  const [ranges, setRanges] = useState({
    morphStart: 140,
    morphEnd: 1300,
    driftEnd: 2500,
  });
  const { scrollY } = useScroll();
  const morph = useTransform(scrollY, [ranges.morphStart, ranges.morphEnd], [0, 1]);
  const canvasY = useTransform(
    scrollY,
    [0, ranges.morphStart, ranges.morphEnd, ranges.driftEnd],
    [0, -12, -62, -92],
  );
  const canvasScale = useTransform(scrollY, [0, ranges.driftEnd], [1, 1.03]);
  const canvasOpacity = useTransform(
    scrollY,
    [0, ranges.morphStart * 0.68, ranges.morphEnd, ranges.driftEnd],
    [0.76, 0.74, 0.67, 0.52],
  );

  useEffect(() => {
    const fallbackTimer = window.setTimeout(() => {
      setSceneReady(true);
    }, 1500);

    return () => window.clearTimeout(fallbackTimer);
  }, []);

  useEffect(() => {
    const recalculateRanges = () => {
      const hero = document.getElementById("hero-section");
      const platformEngines = document.getElementById("platform-engines");
      const heroHeight = hero?.getBoundingClientRect().height ?? window.innerHeight;
      const platformTop = platformEngines
        ? platformEngines.getBoundingClientRect().top + window.scrollY
        : heroHeight * 1.75;
      const morphStart = Math.max(110, heroHeight * 0.25);
      const morphEnd = Math.max(morphStart + 460, platformTop - window.innerHeight * 0.32);
      const driftEnd = morphEnd + window.innerHeight * 0.95;
      setRanges({ morphStart, morphEnd, driftEnd });
    };

    recalculateRanges();
    window.addEventListener("resize", recalculateRanges);
    return () => window.removeEventListener("resize", recalculateRanges);
  }, []);

  return (
    <>
      <AnimatePresence>
        {!sceneReady ? (
          <motion.div
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.45 }}
            className="pointer-events-none fixed inset-0 z-[4]"
          >
            <div className="absolute inset-0 bg-[#0a0a0b]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(79,107,255,0.16),transparent_44%)]" />
            <div className="absolute left-1/2 top-[42%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/25 bg-primary/10 blur-[2px]" />
          </motion.div>
        ) : null}
      </AnimatePresence>
      <motion.div className="pointer-events-none fixed inset-0 z-[2]" style={{ y: canvasY, scale: canvasScale, opacity: canvasOpacity }}>
        <Canvas
          camera={{ position: [0, 0, 7.3], fov: 38 }}
          dpr={[0.9, 1.05]}
          gl={{ antialias: false, alpha: true, powerPreference: "high-performance" }}
          onCreated={() => {
            setSceneReady(true);
          }}
        >
          <color attach="background" args={["#0a0a0b"]} />
          <fog attach="fog" args={["#0a0a0b", 9, 18]} />
          <ambientLight intensity={0.34} />
          <pointLight position={[2.8, 4, 2]} intensity={14} color="#4f6bff" />
          <pointLight position={[-3, -2, 4]} intensity={8} color="#7be0ff" />
          <pointLight position={[0, 3, -3]} intensity={5} color="#d5deff" />
          <ComplianceBrain morph={morph} />
        </Canvas>
      </motion.div>
      <div className="pointer-events-none fixed inset-0 z-[3] bg-[radial-gradient(circle_at_50%_34%,rgba(79,107,255,0.15),transparent_54%),linear-gradient(180deg,rgba(10,10,11,0.06),rgba(10,10,11,0.16))]" />
    </>
  );
}

export function Hero() {
  const router = useRouter();
  const [pointer, setPointer] = useState({ x: 0.5, y: 0.5 });
  const rafRef = useRef<number | null>(null);
  const pendingPointerRef = useRef(pointer);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      pendingPointerRef.current = {
        x: event.clientX / window.innerWidth,
        y: event.clientY / window.innerHeight,
      };
      if (rafRef.current === null) {
        rafRef.current = window.requestAnimationFrame(() => {
          setPointer(pendingPointerRef.current);
          rafRef.current = null;
        });
      }
    };
    window.addEventListener("mousemove", onMove);
    return () => {
      window.removeEventListener("mousemove", onMove);
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const openPlatform = () => {
    const section = document.getElementById("platform-engines");
    if (section) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <section id="hero-section" className="relative min-h-screen overflow-hidden">
      <div className="grid-overlay opacity-30" />
      <div className="noise-overlay" />
      <div className="hero-vignette" />

      <div className="pointer-events-none absolute inset-0 z-20">
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <motion.div
            key={index}
            className="absolute h-1.5 w-1.5 rounded-full bg-accent/65 blur-[0.2px]"
            animate={{
              x: `${pointer.x * (84 - index * 5) + 8}%`,
              y: `${pointer.y * (72 - index * 4) + 8}%`,
              opacity: [0.22, 0.75, 0.22],
            }}
            transition={{
              x: { duration: 0.55 + index * 0.06, ease: [0.16, 1, 0.3, 1] },
              y: { duration: 0.55 + index * 0.06, ease: [0.16, 1, 0.3, 1] },
              opacity: { duration: 2 + index * 0.2, repeat: Infinity },
            }}
          />
        ))}
      </div>



      <header className="absolute inset-x-0 top-0 z-40 mx-auto flex w-full max-w-[1440px] items-center justify-between px-6 py-6 md:px-10">
        <p className="glass-surface rounded-full px-4 py-2 text-[11px] tracking-[0.22em] text-[color:var(--text-muted)]">
          DECISION & FINANCIAL DIGITAL TWIN
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/login")}
            className="rounded-full px-5 py-2.5 text-xs font-semibold tracking-wide bg-white/90 text-[#1e2235] shadow-sm border border-white/20 backdrop-blur-sm transition-all duration-200 hover:bg-white hover:shadow-md active:scale-[0.96] active:shadow-sm"
          >
            Open Dashboard
          </button>
        </div>
      </header>

      <div className="relative z-30 mx-auto flex min-h-screen w-full max-w-[1160px] items-center justify-center px-6 pt-24 md:px-10">
        <div className="mx-auto max-w-5xl text-center depth-fade-in">
          <p className="mb-6 text-xs uppercase tracking-[0.24em] text-[color:var(--text-muted)]">Enterprise Governance Intelligence</p>
          <h1 className="text-[2.7rem] font-medium leading-[0.94] md:text-7xl lg:text-[70px]">
            Reveal Hidden Governance Risks Inside Enterprise Decisions
          </h1>
          <p className="mx-auto mt-7 max-w-3xl text-base leading-relaxed text-[color:var(--text-muted)] md:text-xl">
            A visual audit workspace for tracing risky pathways, reviewing evidence, and exporting the report.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={openPlatform}
              className="rounded-full bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] px-7 py-3.5 text-sm font-bold tracking-wide text-white shadow-lg shadow-[#6c5ce7]/25 transition-all duration-200 hover:shadow-xl hover:shadow-[#6c5ce7]/35 hover:brightness-110 active:scale-[0.96] active:shadow-md active:brightness-95"
            >
              <span className="inline-flex items-center gap-2">
                Explore Platform
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
            <button
              onClick={() => router.push("/login")}
              className="rounded-full border border-white/15 bg-white/8 px-7 py-3.5 text-sm font-bold tracking-wide text-white/90 backdrop-blur-sm transition-all duration-200 hover:bg-white/15 hover:text-white active:scale-[0.96] active:bg-white/6"
            >
              Open Dashboard
            </button>
          </div>
          <motion.div
            animate={{ y: [0, 6, 0], opacity: [0.45, 0.85, 0.45] }}
            transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            className="mt-10 inline-flex items-center justify-center rounded-full border border-border/60 bg-panel/40 p-2.5 text-[color:var(--text-muted)]"
          >
            <ArrowDown className="h-4 w-4" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}
