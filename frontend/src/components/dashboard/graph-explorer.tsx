"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, Line, OrbitControls } from "@react-three/drei";
import { AnimatePresence, motion } from "framer-motion";
import { useTheme } from "next-themes";
import { Maximize2, RotateCcw, X } from "lucide-react";
import * as THREE from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CaseResult, GraphEdge, GraphNode } from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";

type PositionedNode = GraphNode & {
  position: THREE.Vector3;
};

type SceneData = {
  nodes: PositionedNode[];
  edges: GraphEdge[];
  riskNodes: Set<string>;
  pathNodes: Set<string>;
  pathEdges: Set<string>;
};

type GraphExplorerProps = {
  title?: string;
  subtitle?: string;
  emptyMessage?: string;
  graphOverride?: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    risk_nodes: string[];
  } | null;
  casesOverride?: CaseResult[];
  activeCaseIdOverride?: string | null;
  statusOverride?: string;
};

const TYPE_COLORS: Record<string, string> = {
  Employee: "#4f6bff",
  Vendor: "#7be0ff",
  Invoice: "#facc15",
  Approval: "#60a5fa",
  Payment: "#8b5cf6",
  Decision: "#4f6bff",
  Rule: "#7be0ff",
  Case: "#ff4d4f",
};

const RISK_PATH_COLORS: Record<string, string> = {
  LOW: "#22c55e",
  MEDIUM: "#f59e0b",
  HIGH: "#fb923c",
  CRITICAL: "#ff4d4f",
};

const LEGEND_ITEMS = [
  { label: "Vendor", color: TYPE_COLORS.Vendor },
  { label: "Invoice", color: TYPE_COLORS.Invoice },
  { label: "Payment", color: TYPE_COLORS.Payment },
  { label: "Risk / Case", color: TYPE_COLORS.Case },
];

const MAX_ACTIVE_PATH_NODES = 22;
const MAX_ACTIVE_PATH_EDGES = 14;
const CAMERA_DIRECTION = new THREE.Vector3(0.62, 0.28, 1).normalize();

function canonicalType(type: string | undefined): string {
  const value = (type ?? "").trim().toLowerCase();
  if (value.includes("employee") || value === "emp") {
    return "Employee";
  }
  if (value.includes("vendor")) {
    return "Vendor";
  }
  if (value.includes("invoice")) {
    return "Invoice";
  }
  if (value.includes("approval") || value.includes("approver")) {
    return "Approval";
  }
  if (value.includes("payment") || value.includes("payout")) {
    return "Payment";
  }
  if (value.includes("decision")) {
    return "Decision";
  }
  if (value.includes("rule")) {
    return "Rule";
  }
  if (value.includes("case")) {
    return "Case";
  }
  return "Unknown";
}

function seededFromId(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 9973;
  }
  return (hash % 1000) / 1000;
}

function edgeKey(source: string, target: string): string {
  return `${source}>${target}`;
}

function chooseActiveCase(cases: CaseResult[], activeCaseId: string | null): CaseResult | null {
  if (activeCaseId) {
    const active = cases.find((item) => item.case_id === activeCaseId);
    if (active) {
      return active;
    }
  }
  return cases[0] ?? null;
}

function buildLayout(nodes: GraphNode[], edges: GraphEdge[]): PositionedNode[] {
  if (!nodes.length) {
    return [];
  }

  const orderedTypes = ["Employee", "Vendor", "Invoice", "Approval", "Payment", "Decision", "Rule", "Case"];
  const grouped = new Map<string, GraphNode[]>();
  const degrees = new Map<string, number>();

  for (const edge of edges) {
    degrees.set(edge.source, (degrees.get(edge.source) ?? 0) + 1);
    degrees.set(edge.target, (degrees.get(edge.target) ?? 0) + 1);
  }

  for (const node of nodes) {
    const key = canonicalType(node.type);
    const bucket = grouped.get(key) ?? [];
    bucket.push(node);
    grouped.set(key, bucket);
  }

  const allTypes = [...orderedTypes, ...[...grouped.keys()].filter((type) => !orderedTypes.includes(type))];
  const maxGroupSize = Math.max(...[...grouped.values()].map((bucket) => bucket.length));
  const dominantTypeLayout = maxGroupSize / nodes.length > 0.62 || allTypes.length <= 2;

  if (dominantTypeLayout) {
    const sorted = [...nodes].sort((a, b) => (degrees.get(b.id) ?? 0) - (degrees.get(a.id) ?? 0));
    const positioned: PositionedNode[] = [];

    let index = 0;
    let ring = 0;
    while (index < sorted.length) {
      const nodesInRing = 10 + ring * 6;
      const ringRadius = 2.6 + ring * 1.45;

      for (let ringIndex = 0; ringIndex < nodesInRing && index < sorted.length; ringIndex += 1, index += 1) {
        const node = sorted[index];
        const seed = seededFromId(node.id);
        const theta = (ringIndex / nodesInRing) * Math.PI * 2 + ring * 0.34 + seed * 0.22;
        const radius = ringRadius + seed * 0.55;
        const x = Math.cos(theta) * radius;
        const y = Math.sin(theta) * radius * 0.78;
        const z = (seed - 0.5) * 4.2 + Math.sin(theta * 1.6) * 0.9;

        positioned.push({
          ...node,
          type: canonicalType(node.type),
          position: new THREE.Vector3(x, y, z),
        });
      }

      ring += 1;
    }

    const centroid = positioned
      .reduce((acc, node) => acc.add(node.position), new THREE.Vector3())
      .divideScalar(positioned.length);

    return positioned.map((node) => ({
      ...node,
      position: node.position.clone().sub(centroid),
    }));
  }

  const positioned: PositionedNode[] = [];

  const laneGap = 5.1;
  const rowGap = 1.95;

  allTypes.forEach((type, laneIndex) => {
    const bucket = grouped.get(type);
    if (!bucket?.length) {
      return;
    }

    const laneX = (laneIndex - (allTypes.length - 1) / 2) * laneGap;
    const rowCenter = (bucket.length - 1) / 2;

    bucket.forEach((node, rowIndex) => {
      const y = (rowIndex - rowCenter) * rowGap + Math.sin(rowIndex * 0.6 + laneIndex * 0.35) * 0.26;
      const z = Math.cos(rowIndex * 0.9 + laneIndex * 0.4) * 2.1;
      positioned.push({
        ...node,
        type,
        position: new THREE.Vector3(laneX, y, z),
      });
    });
  });

  const centroid = positioned
    .reduce((acc, node) => acc.add(node.position), new THREE.Vector3())
    .divideScalar(positioned.length);

  return positioned.map((node) => ({
    ...node,
    position: node.position.clone().sub(centroid),
  }));
}

function buildSceneData(nodes: GraphNode[], edges: GraphEdge[], activeCase: CaseResult | null, graphRiskNodes: string[]): SceneData {
  const pathNodeList = (activeCase?.path_nodes ?? []).slice(0, MAX_ACTIVE_PATH_NODES);
  const pathNodes = new Set(pathNodeList);
  const pathEdges = new Set<string>();
  const uniqueSegments = new Set<string>();

  for (let index = 0; index < pathNodeList.length - 1; index += 1) {
    if (uniqueSegments.size >= MAX_ACTIVE_PATH_EDGES) {
      break;
    }

    const source = pathNodeList[index];
    const target = pathNodeList[index + 1];
    if (!source || !target || source === target) {
      continue;
    }

    const directedKey = edgeKey(source, target);
    if (uniqueSegments.has(directedKey)) {
      continue;
    }
    uniqueSegments.add(directedKey);
    pathEdges.add(directedKey);
    pathEdges.add(edgeKey(target, source));
  }

  return {
    nodes: buildLayout(nodes, edges),
    edges,
    riskNodes: new Set(graphRiskNodes),
    pathNodes,
    pathEdges,
  };
}

function connectedToNode(edge: GraphEdge, selectedNodeId: string | null): boolean {
  if (!selectedNodeId) {
    return false;
  }
  return edge.source === selectedNodeId || edge.target === selectedNodeId;
}

function explainNode(node: GraphNode, riskNodes: Set<string>, connectedEdges: number): { why: string; action: string; actor: string; says: string } {
  const actor = String(node.owner ?? node.actor ?? node.created_by ?? node.employee_id ?? node.vendor_id ?? node.id);
  const action = String(node.action ?? node.status ?? node.type ?? "Recorded in transaction graph");
  const says = String(node.description ?? node.label ?? node.id);

  const riskText = riskNodes.has(node.id)
    ? "This node is part of a risk-sensitive chain detected by governance rules."
    : "This node represents a normal relationship in the enterprise transaction flow.";

  const why = `${riskText} It connects to ${connectedEdges} neighboring node${connectedEdges === 1 ? "" : "s"}.`;
  return { why, action, actor, says };
}

function fitSceneToViewport(
  camera: THREE.PerspectiveCamera,
  controls: OrbitControlsImpl,
  sceneData: SceneData,
  selectedNodeId: string | null,
): void {
  if (!sceneData.nodes.length) {
    return;
  }

  const focusNodes = selectedNodeId
    ? sceneData.nodes.filter((node) => node.id === selectedNodeId)
    : sceneData.nodes;

  const targetNodes = focusNodes.length ? focusNodes : sceneData.nodes;
  const box = new THREE.Box3().setFromPoints(targetNodes.map((node) => node.position));
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const fitHeightDistance = size.y / (2 * Math.tan((Math.PI * camera.fov) / 360));
  const fitWidthDistance = (size.x / camera.aspect) / (2 * Math.tan((Math.PI * camera.fov) / 360));
  const depthDistance = size.z * 1.3;
  const distance = Math.max(fitHeightDistance, fitWidthDistance, depthDistance, 14) * (selectedNodeId ? 2.6 : 1.55);

  const nextPosition = center.clone().add(CAMERA_DIRECTION.clone().multiplyScalar(distance));
  camera.position.copy(nextPosition);
  camera.near = 0.1;
  camera.far = Math.max(240, distance * 6);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.minDistance = Math.max(4, distance * 0.22);
  controls.maxDistance = Math.max(32, distance * 2.9);
  controls.update();
}

function GraphScene({
  data,
  activeCase,
  selectedNodeId,
  onNodeClick,
}: {
  data: SceneData;
  activeCase: CaseResult | null;
  selectedNodeId: string | null;
  onNodeClick: (nodeId: string) => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const [hoveredNode, setHoveredNode] = useState<string | null>(null);

  const nodeMap = useMemo(() => new Map(data.nodes.map((node) => [node.id, node])), [data.nodes]);
  const pathColor = activeCase ? RISK_PATH_COLORS[activeCase.risk_level] ?? "#ff4d4f" : "#22c55e";
  const decimationStep = Math.max(1, Math.ceil(data.edges.length / 120));

  const { theme } = useTheme();

  useFrame((state) => {
    if (!groupRef.current) {
      return;
    }
    groupRef.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.08) * 0.01;
  });

  return (
    <group ref={groupRef}>
      {data.edges.map((edge, index) => {
        const source = nodeMap.get(edge.source);
        const target = nodeMap.get(edge.target);
        if (!source || !target) {
          return null;
        }

        const activePath = data.pathEdges.has(edgeKey(edge.source, edge.target));
        const selectedEdge = connectedToNode(edge, selectedNodeId);
        if (!activePath && !selectedEdge && index % decimationStep !== 0) {
          return null;
        }
        const lineColor = activePath
          ? pathColor
          : selectedEdge
            ? theme === "dark"
              ? "#c4b5fd"
              : "#4f46e5"
            : theme === "dark"
              ? "#7c8aa8"
              : "#94a3b8";
        const lineOpacity = activePath ? 0.88 : selectedEdge ? 0.46 : 0.16;
        const lineWidth = activePath ? 1.55 : selectedEdge ? 1.05 : 0.45;

        return (
          <Line
            key={`${edge.id}-${index}`}
            points={[source.position, target.position]}
            color={lineColor}
            lineWidth={lineWidth}
            transparent
            opacity={lineOpacity}
            dashed={activePath}
            dashSize={activePath ? 0.18 : 0}
            gapSize={activePath ? 0.12 : 0}
            dashOffset={index * 0.02}
          />
        );
      })}

      {data.nodes.map((node) => {
        const isRisk = data.riskNodes.has(node.id);
        const isPath = data.pathNodes.has(node.id);
        const isHovered = hoveredNode === node.id;
        const isSelected = selectedNodeId === node.id;
        const scale = isRisk ? 1.22 : isPath ? 1.1 : isSelected ? 1.08 : isHovered ? 1.05 : 1;
        const typeColor = TYPE_COLORS[canonicalType(node.type)] ?? "#9aa0a6";

        return (
          <mesh
            key={node.id}
            position={node.position}
            onPointerOver={(event) => {
              event.stopPropagation();
              setHoveredNode(node.id);
            }}
            onPointerOut={(event) => {
              event.stopPropagation();
              setHoveredNode(null);
            }}
            onClick={(event) => {
              event.stopPropagation();
              onNodeClick(node.id);
            }}
          >
            <sphereGeometry args={[0.22 * scale, 18, 18]} />
            <meshPhysicalMaterial
              color={isRisk ? "#ff4d4f" : typeColor}
              emissive={isRisk ? "#ff4d4f" : typeColor}
              emissiveIntensity={isRisk ? 0.36 : isPath ? 0.18 : isSelected ? 0.14 : 0.05}
              roughness={0.34}
              metalness={0.28}
              transmission={0.05}
              transparent
              opacity={isRisk ? 1 : 0.95}
              clearcoat={0.48}
            />

            {isRisk ? (
              <mesh>
                <sphereGeometry args={[0.38 * scale, 12, 12]} />
                <meshBasicMaterial color="#ff4d4f" transparent opacity={0.08} blending={THREE.AdditiveBlending} />
              </mesh>
            ) : null}

            {(isSelected || isPath) && !isRisk ? (
              <mesh>
                <sphereGeometry args={[0.3 * scale, 12, 12]} />
                <meshBasicMaterial color={typeColor} transparent opacity={0.06} blending={THREE.AdditiveBlending} />
              </mesh>
            ) : null}

            {(isHovered || isSelected) && (
              <Html distanceFactor={18}>
                <div className="pointer-events-none rounded-2xl border border-[var(--card-border)]/70 bg-[var(--card-bg)]/95 px-3 py-1.5 text-[10px] font-semibold text-[var(--foreground)] shadow-lg backdrop-blur-md">
                  {node.label ?? node.id}
                </div>
              </Html>
            )}
          </mesh>
        );
      })}
    </group>
  );
}

export function GraphExplorer({
  title = "Relationship map",
  subtitle = "A calmer, easier-to-read view of the operational network.",
  emptyMessage,
  graphOverride = null,
  casesOverride,
  activeCaseIdOverride,
  statusOverride,
}: GraphExplorerProps) {
  const storeGraph = useDashboardStore((state) => state.graph);
  const storeCases = useDashboardStore((state) => state.cases);
  const storeActiveCaseId = useDashboardStore((state) => state.activeCaseId);
  const storeStatus = useDashboardStore((state) => state.status);
  const openInvestigation = useDashboardStore((state) => state.openInvestigation);
  const { theme } = useTheme();
  const isDark = theme === "dark";

  const graph = graphOverride ?? storeGraph;
  const cases = casesOverride ?? storeCases;
  const activeCaseId = activeCaseIdOverride ?? storeActiveCaseId;
  const status = statusOverride ?? storeStatus;

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const controlsRef = useRef<OrbitControlsImpl | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  const activeCase = useMemo(() => chooseActiveCase(cases, activeCaseId), [cases, activeCaseId]);

  const sceneData = useMemo(() => {
    if (!graph) {
      return null;
    }
    return buildSceneData(graph.nodes, graph.edges, activeCase, graph.risk_nodes);
  }, [graph, activeCase]);

  const selectedNode = useMemo(() => {
    if (!sceneData || !selectedNodeId) {
      return null;
    }
    return sceneData.nodes.find((node) => node.id === selectedNodeId) ?? null;
  }, [sceneData, selectedNodeId]);

  const selectedNodeDetails = useMemo(() => {
    if (!sceneData || !selectedNode) {
      return null;
    }
    const connectedEdges = sceneData.edges.filter(
      (edge) => edge.source === selectedNode.id || edge.target === selectedNode.id,
    ).length;
    return explainNode(selectedNode, sceneData.riskNodes, connectedEdges);
  }, [sceneData, selectedNode]);

  const fitGraphToViewport = useCallback(
    (focusNodeId: string | null) => {
      if (!sceneData || !cameraRef.current || !controlsRef.current) {
        return;
      }
      fitSceneToViewport(cameraRef.current, controlsRef.current, sceneData, focusNodeId);
    },
    [sceneData],
  );

  useEffect(() => {
    if (!sceneData) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      fitGraphToViewport(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sceneData, fitGraphToViewport]);

  if (!sceneData) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-[color:var(--text-muted)]">
        {status === "loading" ? "Constructing enterprise graph..." : emptyMessage ?? "Graph data unavailable."}
      </div>
    );
  }

  return (
    <div className="relative h-full w-full overflow-hidden">
      <div className="pointer-events-none absolute left-4 top-4 z-20 max-w-[320px] rounded-[24px] border border-[var(--card-border)]/80 bg-[var(--card-bg)]/92 px-4 py-3 shadow-xl backdrop-blur-xl">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Graph workspace</p>
        <p className="mt-1 text-base font-semibold tracking-tight text-[var(--foreground)]">{title}</p>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">{subtitle}</p>
        {activeCase ? (
          <div className="mt-3 inline-flex rounded-full border border-[var(--primary)]/20 bg-[var(--primary)]/8 px-2.5 py-1 text-[10px] font-semibold text-[var(--foreground)]">
            Active risk: {activeCase.risk_level}
          </div>
        ) : null}
      </div>

      <div className="absolute right-4 top-4 z-20 flex items-center gap-2 rounded-full border border-[var(--card-border)]/80 bg-[var(--card-bg)]/88 p-1.5 shadow-lg backdrop-blur-xl">
        <button
          onClick={() => {
            setSelectedNodeId(null);
            fitGraphToViewport(null);
          }}
          className="inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-xs font-semibold text-[var(--text-muted)] transition-colors hover:bg-[var(--background)] hover:text-[var(--foreground)]"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Reset
        </button>
        <button
          onClick={() => fitGraphToViewport(selectedNodeId)}
          className="inline-flex items-center gap-1.5 rounded-full bg-[var(--foreground)] px-3 py-2 text-xs font-semibold text-[var(--background)] transition-opacity hover:opacity-90"
        >
          <Maximize2 className="h-3.5 w-3.5" />
          Focus
        </button>
      </div>

      <Canvas
        camera={{ position: [0, 0, 44], fov: 38 }}
        className="h-full w-full"
        dpr={[1, 1.2]}
        onCreated={(state) => {
          cameraRef.current = state.camera as THREE.PerspectiveCamera;
          if (controlsRef.current && sceneData) {
            fitSceneToViewport(cameraRef.current, controlsRef.current, sceneData, null);
          }
        }}
      >
        <color attach="background" args={[isDark ? "#0b1020" : "#f4f7fb"]} />
        <hemisphereLight intensity={isDark ? 0.82 : 0.96} groundColor={isDark ? "#0a0f1d" : "#dbe4f0"} />
        <directionalLight position={[16, 18, 14]} intensity={isDark ? 1.05 : 0.88} color={isDark ? "#dbe7ff" : "#c7d2fe"} />
        <pointLight position={[-12, -6, 18]} intensity={isDark ? 0.45 : 0.32} color={isDark ? "#7dd3fc" : "#93c5fd"} />

        <GraphScene
          data={sceneData}
          activeCase={activeCase}
          selectedNodeId={selectedNodeId}
          onNodeClick={(nodeId) => {
            setSelectedNodeId(nodeId);
            fitGraphToViewport(nodeId);
            const relatedCase = cases.find((item) => item.path_nodes.includes(nodeId) || item.case_id === nodeId);
            if (relatedCase) {
              void openInvestigation(relatedCase.case_id);
            }
          }}
        />

        <OrbitControls
          ref={controlsRef}
          enablePan={false}
          enableZoom
          enableRotate
          enableDamping
          maxDistance={120}
          minDistance={8}
          autoRotate={false}
        />
      </Canvas>

      <div className="pointer-events-none absolute bottom-4 left-4 z-20 flex flex-wrap items-center gap-2 rounded-[22px] border border-[var(--card-border)]/80 bg-[var(--card-bg)]/90 px-3 py-2 shadow-lg backdrop-blur-xl">
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="inline-flex items-center gap-2 text-[10px] font-semibold text-[var(--text-muted)]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </div>
        ))}
      </div>

      <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 hidden -translate-x-1/2 rounded-full border border-[var(--card-border)]/80 bg-[var(--card-bg)]/88 px-3 py-1.5 text-[10px] font-medium text-[var(--text-muted)] shadow-lg backdrop-blur-xl md:block">
        Drag to orbit · Scroll to zoom · Click a node for context
      </div>

      <AnimatePresence>
        {selectedNode && selectedNodeDetails ? (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="absolute bottom-4 right-4 z-30 w-[320px] max-w-[calc(100%-2rem)] overflow-hidden rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)]/96 shadow-2xl backdrop-blur-xl"
          >
            <div className="flex items-center justify-between border-b border-[var(--card-border)] px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Selected node</p>
                <p className="text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">{selectedNode.type}</p>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--card-border)] bg-[var(--background)] transition-colors hover:bg-[var(--card-border)]"
                aria-label="Close node detail"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="custom-scrollbar space-y-3 overflow-y-auto px-4 py-3 text-xs text-[var(--text-muted)]">
              <div>
                <span className="panel-title">Node</span>
                <p className="mt-1 text-[var(--foreground)]">{selectedNode.label ?? selectedNode.id}</p>
              </div>
              <div>
                <span className="panel-title">Why it matters</span>
                <p className="mt-1">{selectedNodeDetails.why}</p>
              </div>
              <div>
                <span className="panel-title">Narrative</span>
                <p className="mt-1">{selectedNodeDetails.says}</p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="panel-title">Action</span>
                  <p className="mt-1">{selectedNodeDetails.action}</p>
                </div>
                <div>
                  <span className="panel-title">Actor</span>
                  <p className="mt-1">{selectedNodeDetails.actor}</p>
                </div>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
