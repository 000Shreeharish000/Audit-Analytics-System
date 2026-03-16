"use client";

import React, { useCallback, useEffect, useMemo, useState, useRef } from "react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  useEdgesState,
  useNodesState,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { AlertTriangle, GitBranch, RefreshCw, Search, X, Maximize2, Minimize2 } from "lucide-react";
import { useTheme } from "next-themes";
import { searchVendors, getVendorSubgraph } from "@/lib/api";
import type {
  CaseResult,
  GraphEdge as BackendGraphEdge,
  GraphNode as BackendGraphNode,
  GraphPayload,
  VendorSearchResult,
} from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";
import { cn } from "@/lib/utils";

const NODE_TYPE_CONFIG: Record<
  string,
  { border: string; bg_dark: string; bg_light: string; text_dark: string; text_light: string; shape: "circle" | "rect" }
> = {
  policy: { border: "#7c3aed", bg_dark: "#0A0B0F", bg_light: "#f5f3ff", text_dark: "#c084fc", text_light: "#6d28d9", shape: "rect" },
  control: { border: "#f97316", bg_dark: "#0A0B0F", bg_light: "#fff7ed", text_dark: "#fb923c", text_light: "#c2410c", shape: "rect" },
  org_role: { border: "#22c55e", bg_dark: "#0A0B0F", bg_light: "#f0fdf4", text_dark: "#4ade80", text_light: "#15803d", shape: "rect" },
  employee: { border: "#00E676", bg_dark: "#0A0B0F", bg_light: "#f0fff4", text_dark: "#00E676", text_light: "#166534", shape: "circle" },
  vendor: { border: "#00D4FF", bg_dark: "#0A0B0F", bg_light: "#ecfeff", text_dark: "#00D4FF", text_light: "#0e7490", shape: "rect" },
  vendor_creation: { border: "#00BCD4", bg_dark: "#0A0B0F", bg_light: "#ecfeff", text_dark: "#00BCD4", text_light: "#0e7490", shape: "rect" },
  invoice: { border: "#FFB800", bg_dark: "#0A0B0F", bg_light: "#fffbeb", text_dark: "#FFB800", text_light: "#b45309", shape: "rect" },
  approval_decision: { border: "#4F8EF7", bg_dark: "#0A0B0F", bg_light: "#eff6ff", text_dark: "#4F8EF7", text_light: "#1d4ed8", shape: "rect" },
  payment_decision: { border: "#14b8a6", bg_dark: "#0A0B0F", bg_light: "#f0fdfa", text_dark: "#2dd4bf", text_light: "#0f766e", shape: "rect" },
  transaction: { border: "#B44FFF", bg_dark: "#0A0B0F", bg_light: "#faf5ff", text_dark: "#B44FFF", text_light: "#7e22ce", shape: "circle" },
  Case: { border: "#c084fc", bg_dark: "#0A0B0F", bg_light: "#faf5ff", text_dark: "#f3e8ff", text_light: "#6b21a8", shape: "rect" },
  Rule: { border: "#2dd4bf", bg_dark: "#0A0B0F", bg_light: "#f0fdfa", text_dark: "#99f6e4", text_light: "#0d9488", shape: "rect" },
  Decision: { border: "#38bdf8", bg_dark: "#0A0B0F", bg_light: "#f0f9ff", text_dark: "#bae6fd", text_light: "#0369a1", shape: "rect" },
};

const RISK_STYLE = {
  borderColor: "#FF3B5C",
  boxShadow: "0 0 18px #FF3B5C80",
};

const EDGE_TYPE_COLORS: Record<string, string> = {
  defines_control: "#fb923c70",
  holds_role: "#22c55e70",
  performed: "#00E67660",
  onboarded: "#00BCD460",
  issued: "#00D4FF40",
  has_approval: "#4F8EF760",
  approved_by: "#4F8EF740",
  governed_by: "#fb923c70",
  monitored_by: "#f59e0b70",
  ready_for_payment: "#2dd4bf70",
  authorized_payment: "#14b8a670",
  authorized_by: "#22c55e70",
  violates_if_missing: "#ef444470",
  paid_by: "#B44FFF60",
};

const ROW_ORDER = [
  "policy",
  "control",
  "org_role",
  "employee",
  "vendor_creation",
  "vendor",
  "invoice",
  "approval_decision",
  "payment_decision",
  "transaction",
  "Case",
  "Rule",
  "Decision",
];

const Y_GAP = 150;
const X_GAP = 120;
const GOVERNANCE_NODE_TYPES = new Set([
  "policy",
  "control",
  "org_role",
  "employee",
  "vendor_creation",
  "approval_decision",
  "payment_decision",
]);
const OPERATIONAL_NODE_TYPES = new Set([
  "employee",
  "vendor",
  "vendor_creation",
  "invoice",
  "approval_decision",
  "payment_decision",
  "transaction",
]);

type GraphViewMode = "all" | "governance" | "operational";
type BackendNodeRecord = BackendGraphNode & { node_type?: string | null };
type BackendEdgeRecord = BackendGraphEdge & { edge_type?: string | null };
type GraphNodeData = Record<string, unknown> & {
  label: string;
  node_type?: string | null;
  case_id?: string | null;
  action?: string | null;
  created_by?: string | null;
  approved_by?: string | null;
  authorized_by?: string | null;
  owner?: string | null;
  actor_id?: string | null;
  timestamp?: string | null;
};
type GraphStats = {
  total_nodes?: number;
  total_edges?: number;
};
type FitViewController = {
  fitView: (options?: {
    padding?: number;
    duration?: number;
  }) => void;
};
type GraphPayloadView = GraphPayload & {
  nodes: BackendNodeRecord[];
  edges: BackendEdgeRecord[];
  stats?: GraphStats;
  risk_node_ids?: string[];
};
type VendorSearchOption = VendorSearchResult & {
  id?: string;
  has_risk?: boolean;
};
type SelectedVendorSubgraph = {
  vendor_id: string;
  vendor_name: string;
  stats: {
    nodes: number;
    edges: number;
  };
  risk_findings: Array<{
    risk_type?: string;
    policy_violation?: string;
  }>;
  nodes: BackendNodeRecord[];
  risk_node_ids: string[];
};

function getNodeType(node: BackendNodeRecord): string {
  if (typeof node.node_type === "string" && node.node_type.trim()) {
    return node.node_type;
  }
  return typeof node.type === "string" && node.type.trim() ? node.type : "unknown";
}

function getOrderedNodeTypes(backendNodes: BackendNodeRecord[]): string[] {
  const presentTypes = new Set(backendNodes.map((node) => getNodeType(node)));
  const ordered = ROW_ORDER.filter((type) => presentTypes.has(type));
  const extras = [...presentTypes].filter((type) => !ROW_ORDER.includes(type)).sort();
  return [...ordered, ...extras];
}

function buildNodes(
  backendNodes: BackendNodeRecord[],
  riskSet: Set<string>,
  isDark: boolean,
  orderedTypes: string[],
): Node<GraphNodeData>[] {
  const groups: Record<string, BackendNodeRecord[]> = {};
  for (const node of backendNodes) {
    const nodeType = getNodeType(node);
    if (!groups[nodeType]) groups[nodeType] = [];
    groups[nodeType].push(node);
  }

  const nodes: Node<GraphNodeData>[] = [];
  orderedTypes.forEach((type, rowIndex) => {
    const items = [...(groups[type] ?? [])].sort((a, b) => a.id.localeCompare(b.id));
    const rowGap = items.length >= 6 ? 136 : X_GAP;
    const startX = -((items.length - 1) * rowGap) / 2;
    items.forEach((item, colIndex) => {
      const cfg = NODE_TYPE_CONFIG[type] ?? {
        border: "#666",
        bg_dark: "#0A0B0F",
        bg_light: "#ffffff",
        text_dark: "#ccc",
        text_light: "#333",
        shape: "rect",
      };
      const isRisk = riskSet.has(item.id);
      const isCircle = cfg.shape === "circle";

      let label = item.id as string;
      if (label.startsWith("AD-")) label = label.replace("AD-", "");
      if (label.startsWith("vc_")) label = label.replace("vc_", "vc:");

      nodes.push({
        id: item.id,
        type: "default",
        sourcePosition: Position.Bottom,
        targetPosition: Position.Top,
        position: { x: startX + colIndex * rowGap, y: rowIndex * Y_GAP },
        data: { label, ...item },
        style: {
          background: isDark ? cfg.bg_dark : cfg.bg_light,
          border: `2px ${isRisk ? "dashed" : "solid"} ${isRisk ? RISK_STYLE.borderColor : cfg.border}`,
          color: isDark ? cfg.text_dark : cfg.text_light,
          borderRadius: isCircle ? "50%" : "6px",
          fontSize: "9px",
          fontFamily: "JetBrains Mono, monospace",
          padding: "6px",
          width: isCircle ? 72 : 84,
          height: isCircle ? 72 : 36,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          pointerEvents: "auto",
          ...(isRisk ? { boxShadow: RISK_STYLE.boxShadow } : {}),
        },
      });
    });
  });

  return nodes;
}

function buildEdges(
  backendEdges: BackendEdgeRecord[],
  riskSet: Set<string>,
  highlightedPath: string[] = [],
  matchedCases: CaseResult[] = [],
): Edge[] {
  // Active case path pairs (highlighted in gold)
  const pathPairs = new Set<string>();
  if (highlightedPath && highlightedPath.length > 1) {
    for (let i = 0; i < highlightedPath.length - 1; i++) {
      pathPairs.add(`${highlightedPath[i]}->${highlightedPath[i + 1]}`);
    }
  }

  // Build risk-level edge maps from ALL matched cases
  const highRiskPairs = new Set<string>();
  const mediumRiskPairs = new Set<string>();
  for (const c of matchedCases) {
    const pn: string[] = c.path_nodes ?? [];
    if (pn.length > 1) {
      for (let i = 0; i < pn.length - 1; i++) {
        const pair = `${pn[i]}->${pn[i + 1]}`;
        if (c.risk_level === "HIGH" || c.risk_level === "CRITICAL") {
          highRiskPairs.add(pair);
        } else if (c.risk_level === "MEDIUM") {
          mediumRiskPairs.add(pair);
        }
      }
    }
  }

  return backendEdges.map((edge) => {
    const pair = `${edge.source}->${edge.target}`;
    const edgeType = typeof edge.edge_type === "string" && edge.edge_type ? edge.edge_type : edge.type;
    const inPath = pathPairs.has(pair);
    const isHighRisk = highRiskPairs.has(pair);
    const isMediumRisk = mediumRiskPairs.has(pair);
    const isRisk = riskSet.has(edge.source) && riskSet.has(edge.target);

    let stroke: string;
    let strokeWidth: number;
    let opacity: number;
    let className = "";
    let zIndex = 1;

    if (inPath) {
      // Active case path: bright gold
      stroke = "#FFB800";
      strokeWidth = 3.5;
      opacity = 1;
      className = "pulse-gold";
      zIndex = 10;
    } else if (isHighRisk) {
      // HIGH / CRITICAL case path: red
      stroke = "#FF3B5C";
      strokeWidth = 3;
      opacity = 1;
      className = "pulse-red";
      zIndex = 8;
    } else if (isMediumRisk) {
      // MEDIUM case path: amber/yellow
      stroke = "#FFB800";
      strokeWidth = 2.5;
      opacity = 0.85;
      className = "pulse-gold";
      zIndex = 6;
    } else if (isRisk) {
      // Generic risk node connection (Case↔Rule)
      stroke = "#FF3B5C";
      strokeWidth = 2;
      opacity = 0.65;
      className = "pulse-red";
      zIndex = 5;
    } else {
      stroke = EDGE_TYPE_COLORS[edgeType] ?? "#00D4FF30";
      strokeWidth = 1.5;
      opacity = 0.4;
    }

    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: inPath || isHighRisk || isMediumRisk || isRisk,
      style: { stroke, strokeWidth, opacity },
      className,
      zIndex,
    };
  });
}

function NodeDetail({
  node,
  onClose,
  onOpenInvestigation,
}: {
  node: Node<GraphNodeData>;
  onClose: () => void;
  onOpenInvestigation?: (caseId: string) => void;
}) {
  const attrs = node.data;
  const skip = new Set(["id", "label"]);
  const entries = Object.entries(attrs).filter(([key]) => !skip.has(key));

  const formatValue = (key: string, value: unknown) => {
    if (value == null) return "-";
    if ((key === "amount" || key.includes("amount")) && typeof value === "number") {
      return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(value);
    }
    return String(value);
  };

  return (
    <div className={cn(
      "absolute inset-y-0 right-0 z-50 w-[340px] overflow-y-auto border-l p-5 shadow-2xl backdrop-blur-md",
      "border-border bg-card text-foreground"
    )}>
      <div className="mb-4 flex items-center justify-between">
        <span className="font-mono text-sm font-bold text-emerald-400">{node.id}</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 text-xs">
        {node.data.action && (
          <div className="flex flex-col gap-0.5 border-b border-border pb-2">
            <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Action</span>
            <span className="text-foreground">{node.data.action}</span>
          </div>
        )}
        {(node.data.created_by || node.data.approved_by || node.data.authorized_by || node.data.owner || node.data.actor_id) && (
          <div className="flex flex-col gap-0.5 border-b border-border pb-2">
            <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Actor</span>
            <span className="text-foreground">
              {node.data.created_by || node.data.approved_by || node.data.authorized_by || node.data.owner || node.data.actor_id}
            </span>
          </div>
        )}
        {node.data.timestamp && (
          <div className="flex flex-col gap-0.5 border-b border-border pb-2">
            <span className="block text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Timestamp</span>
            <span className="text-foreground">{node.data.timestamp}</span>
          </div>
        )}
        
        {entries.map(([key, value]) => {
          if (["action", "created_by", "approved_by", "authorized_by", "owner", "actor_id", "timestamp", "node_type", "case_id"].includes(key)) return null;
          return (
            <div key={key} className="flex flex-col gap-0.5 border-b border-border pb-2">
              <span className="font-mono uppercase tracking-wide text-muted-foreground">{key.replace(/_/g, " ")}</span>
              <span className="break-all font-mono text-foreground">{formatValue(key, value)}</span>
            </div>
          );
        })}

        {(node.data.node_type === "Case" || node.data.case_id) && onOpenInvestigation && (
          <div className="pt-4">
            <button
              onClick={() => onOpenInvestigation(node.data.case_id || node.id)}
              className="w-full rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] py-3 text-xs font-bold text-white shadow-lg shadow-[#6c5ce7]/20 transition-all hover:scale-[1.02] hover:shadow-xl active:scale-[0.98]"
            >
              Click to Investigate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Legend({ nodeTypeCounts, isDark }: { nodeTypeCounts: Record<string, number>; isDark: boolean }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 font-mono text-[10px]">
      {Object.entries(NODE_TYPE_CONFIG)
        .filter(([type]) => nodeTypeCounts[type] != null)
        .map(([type, cfg]) => (
        <span key={type} className="flex items-center gap-1.5 hover:opacity-80 transition-opacity">
          <span className="inline-block h-3 w-3 rounded-sm border" style={{ borderColor: cfg.border }} />
          <span style={{ color: isDark ? cfg.text_dark : cfg.text_light }}>{type.replace(/_/g, " ")}</span>
          {nodeTypeCounts[type] != null && <span className="text-slate-500">({nodeTypeCounts[type]})</span>}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-3 w-3 rounded-sm border border-dashed border-[#FF3B5C]" />
        <span className="text-[#FF3B5C]">risk node</span>
      </span>
    </div>
  );
}

export function CyberGraph({
  graphData,
  activeCaseId,
  matchedCases = [],
  onOpenInvestigation,
}: {
  graphData: GraphPayloadView | null;
  activeCaseId?: string | null;
  matchedCases?: CaseResult[];
  onOpenInvestigation?: (caseId: string) => void;
}) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";
  const token = useDashboardStore((state) => state.token);
  const refreshPipeline = useDashboardStore((state) => state.refreshPipeline);
  const openInvestigation = useDashboardStore((state) => state.openInvestigation);
  const graphRef = useRef<HTMLDivElement>(null);
  const reactFlowRef = useRef<FitViewController | null>(null);

  const [showRiskOnly, setShowRiskOnly] = useState(false);
  const [viewMode, setViewMode] = useState<GraphViewMode>("all");
  const [selectedNode, setSelectedNode] = useState<Node<GraphNodeData> | null>(null);
  const [phase, setPhase] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<VendorSearchOption[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedVendorSubgraph, setSelectedVendorSubgraph] = useState<SelectedVendorSubgraph | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node<GraphNodeData>>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      graphRef.current?.requestFullscreen().catch(err => {
        console.error(`Error attempting to enable full-screen mode: ${err.message}`);
      });
    } else {
      document.exitFullscreen();
    }
  };

  const handleVendorSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults(null);
      return;
    }
    if (!token) return;
    setSearchLoading(true);
    try {
      const response = await searchVendors(token, query);
      setSearchResults(response.results ?? []);
    } catch {
      setSearchResults([]);
    }
    setSearchLoading(false);
  };

  const handleSelectVendor = async (vendorId: string) => {
    setSearchResults(null);
    setSearchQuery("");
    if (!token) return;
    try {
      const response = await getVendorSubgraph(token, vendorId);
      // Ensure backend shape matches frontend expectation
      setSelectedVendorSubgraph({
        vendor_id: vendorId,
        vendor_name: response.summary?.vendor_name || vendorId,
        stats: {
           nodes: response.graph?.nodes?.length || 0,
           edges: response.graph?.edges?.length || 0
        },
        risk_findings: [], // Fallback since decision-digital-twin might pass rules_triggered
        nodes: response.graph?.nodes || [],
        risk_node_ids: response.graph?.risk_nodes || []
      });
    } catch {
      setSelectedVendorSubgraph(null);
    }
  };

  const activeCase = matchedCases.find((c) => c.case_id === activeCaseId) || matchedCases[0];
  const highlightedPath = activeCase?.path_nodes;
  const riskSet = useMemo(() => new Set<string>(graphData?.risk_nodes || graphData?.risk_node_ids || []), [graphData]);
  const visibleTypeSet = useMemo(() => {
    if (viewMode === "governance") return GOVERNANCE_NODE_TYPES;
    if (viewMode === "operational") return OPERATIONAL_NODE_TYPES;
    return null;
  }, [viewMode]);
  const visibleBackendNodes = useMemo(() => {
    if (!graphData?.nodes) return [];
    if (!visibleTypeSet) return graphData.nodes;
    return graphData.nodes.filter((node) => visibleTypeSet.has(getNodeType(node)));
  }, [graphData, visibleTypeSet]);
  const orderedNodeTypes = useMemo(() => getOrderedNodeTypes(visibleBackendNodes), [visibleBackendNodes]);

  const allNodes = useMemo(() => {
    if (!visibleBackendNodes.length) return [];
    return buildNodes(visibleBackendNodes, riskSet, isDark, orderedNodeTypes);
  }, [visibleBackendNodes, riskSet, isDark, orderedNodeTypes]);

  const allEdges = useMemo(() => {
    if (!graphData?.edges) return [];
    return buildEdges(graphData.edges, riskSet, highlightedPath || [], matchedCases);
  }, [graphData, riskSet, highlightedPath, matchedCases]);

  const nodeTypeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of visibleBackendNodes) {
      const nodeType = getNodeType(node);
      counts[nodeType] = (counts[nodeType] ?? 0) + 1;
    }
    return counts;
  }, [visibleBackendNodes]);

  // Initial loading animation
  useEffect(() => {
    if (allNodes.length === 0) {
      setNodes([]);
      setEdges([]);
      setPhase(0);
      return;
    }

    setPhase(0);
    setNodes([]);

    const rowNodes = orderedNodeTypes.map((type) => allNodes.filter((node) => node.data.node_type === type));

    const timers = rowNodes.map((_, index) =>
      window.setTimeout(() => {
        setPhase(index + 1);
        const visibleIds = new Set<string>();
        rowNodes.slice(0, index + 1).forEach((group) => group.forEach((node) => visibleIds.add(node.id)));
        setNodes(allNodes.filter((node) => visibleIds.has(node.id)));
      }, index * 400),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allNodes, orderedNodeTypes]);

  // Update edges separately so they don't re-animate the nodes
  useEffect(() => {
    const visibleNodeIds = new Set(nodes.map(n => n.id));
    setEdges(allEdges.filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)));
  }, [allEdges, nodes, setEdges]);

  const filteredNodes = useMemo(() => {
    const pathSet = new Set<string>(highlightedPath ?? []);

    return nodes
      .map((node) => {
        const inPath = pathSet.has(node.id);
        const isRiskNode = riskSet.has(node.id);
        const dimmed = showRiskOnly && !isRiskNode;
        const pathGlow = isDark ? "0 0 20px rgba(255, 184, 0, 0.28)" : "0 0 16px rgba(255, 184, 0, 0.2)";
        const riskGlow = isDark ? "0 0 14px rgba(255, 59, 92, 0.18)" : "0 0 10px rgba(255, 59, 92, 0.12)";
        
        return {
          ...node,
          zIndex: inPath ? 100 : (isRiskNode ? 50 : 1),
          className: cn(
            node.className,
            inPath && "pulse-gold-node",
            isRiskNode && !inPath && "highlight-risk-node"
          ),
          style: {
            ...node.style,
            opacity: dimmed && !inPath ? 0.15 : 1,
            ...(isRiskNode && !inPath
              ? {
                  boxShadow: riskGlow,
                }
              : {}),
            ...(inPath
              ? {
                  border: "3px solid #FFB800",
                  boxShadow: pathGlow,
                }
              : {}),
          },
        };
      });
  }, [highlightedPath, isDark, nodes, riskSet, showRiskOnly]);

  const displayEdges = useMemo(() => {
    const visibleIds = new Set(filteredNodes.map((node) => node.id));
    return edges.filter((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target));
  }, [edges, filteredNodes]);

  useEffect(() => {
    if (!reactFlowRef.current || !filteredNodes.length || phase < orderedNodeTypes.length) {
      return;
    }

    const timer = window.setTimeout(() => {
      reactFlowRef.current?.fitView({ padding: 0.12, duration: 350 });
    }, 80);

    return () => window.clearTimeout(timer);
  }, [filteredNodes, displayEdges, phase, orderedNodeTypes.length, isFullscreen]);

  useEffect(() => {
    if (!graphRef.current || !reactFlowRef.current || !filteredNodes.length || phase < orderedNodeTypes.length) {
      return;
    }

    const observer = new ResizeObserver(() => {
      window.requestAnimationFrame(() => {
        reactFlowRef.current?.fitView({ padding: 0.12, duration: 250 });
      });
    });

    observer.observe(graphRef.current);
    return () => observer.disconnect();
  }, [filteredNodes.length, phase, orderedNodeTypes.length, isFullscreen]);

  const onNodeClick: NodeMouseHandler<Node<GraphNodeData>> = useCallback((_event, node) => {
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
    
    // Find related case and open investigation
    const relatedCase = matchedCases.find((c) => c.path_nodes.includes(node.id) || c.case_id === node.id);
    if (relatedCase) {
      void openInvestigation(relatedCase.case_id);
    }
  }, [matchedCases, openInvestigation]);

  if (!graphData) {
     return <div className="flex h-full items-center justify-center text-slate-400">Loading graph data...</div>;
  }

  const stats = graphData?.stats ?? { total_nodes: graphData.nodes?.length, total_edges: graphData.edges?.length };
  const riskCount = graphData?.risk_nodes?.length ?? graphData?.risk_node_ids?.length ?? 0;

  return (
    <div ref={graphRef} className={cn(
      "flex h-full w-full flex-col overflow-hidden relative",
      isDark ? "bg-[#0b1121] text-slate-200" : "bg-white text-slate-800"
    )}>
      <div className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-b border-border/30 px-6 py-3 z-10",
        isDark ? "bg-[#0b1121]" : "bg-slate-50"
      )}>
        <div className="flex flex-wrap items-center gap-4">
          <h1 className={cn("text-lg font-bold tracking-tight", isDark ? "text-white" : "text-slate-900")}>Financial Digital Twin Graph</h1>
          <div className="flex gap-3 font-mono text-xs text-slate-400">
            <span className="text-blue-400">{stats.total_nodes ?? 0} nodes</span>
            <span>|</span>
            <span>{stats.total_edges ?? 0} edges</span>
            {riskCount > 0 && (
              <>
                <span>|</span>
                <span className="flex items-center gap-1 text-[#FF3B5C]">
                  <AlertTriangle className="h-3 w-3" />
                  {riskCount} risk nodes
                </span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className={cn(
            "flex items-center gap-1 rounded border px-1 py-1",
            isDark ? "border-slate-700/50 bg-[#1e293b]/60" : "border-slate-200 bg-white"
          )}>
            {[
              ["all", "All"],
              ["governance", "Control View"],
              ["operational", "Flow View"],
            ].map(([mode, label]) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode as "all" | "governance" | "operational")}
                className={cn(
                  "rounded px-2 py-1 font-mono text-[11px] transition-colors",
                  viewMode === mode 
                    ? (isDark ? "bg-blue-500/20 text-blue-400 border border-blue-500/50" : "bg-blue-50 text-blue-600 border border-blue-200")
                    : (isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900"),
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="relative">
            <div className={cn(
              "flex items-center gap-1.5 rounded border px-2 py-1",
              isDark ? "border-slate-700/50 bg-[#0b1121]" : "border-slate-200 bg-white"
            )}>
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
              <input
                type="text"
                placeholder="Search vendor..."
                value={searchQuery}
                onChange={(event) => {
                  setSearchQuery(event.target.value);
                  void handleVendorSearch(event.target.value);
                }}
                className={cn(
                  "w-32 bg-transparent font-mono text-xs focus:outline-none",
                  isDark ? "text-white placeholder:text-slate-500" : "text-slate-900 placeholder:text-slate-400"
                )}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery("");
                    setSearchResults(null);
                  }}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>

            {searchResults !== null && (
              <div className={cn(
                "absolute left-0 top-full z-50 mt-1 max-h-60 w-64 overflow-y-auto rounded border shadow-xl",
                isDark ? "border-slate-700 bg-[#1e293b]" : "border-slate-200 bg-white"
              )}>
                {searchLoading && <div className="p-3 font-mono text-xs text-slate-400">Searching...</div>}
                {!searchLoading && searchResults.length === 0 && (
                  <div className="p-3 text-xs text-slate-400">No vendors found.</div>
                )}
                {searchResults.map((vendor, index) => {
                  const vendorKey = vendor.vendor_id || vendor.id || String(index);
                  const selectableVendorId = vendor.vendor_id || vendor.id;
                  return (
                  <button
                    key={vendorKey}
                    onClick={() => {
                      if (selectableVendorId) {
                        void handleSelectVendor(selectableVendorId);
                      }
                    }}
                    className={cn(
                      "flex w-full items-center justify-between px-3 py-2 text-left transition-colors",
                      isDark ? "hover:bg-blue-500/10 text-white" : "hover:bg-blue-50 text-slate-900"
                    )}
                  >
                    <div>
                      <div className="font-mono text-xs">{vendor.name}</div>
                      <div className={cn("text-[10px]", isDark ? "text-slate-400" : "text-slate-500")}>
                        {vendor.vendor_id || vendor.id} | {vendor.invoice_count} invoices
                      </div>
                    </div>
                    {vendor.has_risk && <AlertTriangle className="h-3 w-3 flex-shrink-0 text-[#FF3B5C]" />}
                  </button>
                )})}
              </div>
            )}
          </div>

          <button
            onClick={() => setShowRiskOnly(!showRiskOnly)}
            className={cn(
              "rounded border px-3 py-1 font-mono text-xs transition-colors",
              showRiskOnly
                ? "border-[#FF3B5C] text-[#FF3B5C] bg-[#FF3B5C]/10"
                : (isDark ? "border-slate-700/50 text-slate-400 hover:border-slate-500 hover:text-white" : "border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-900"),
            )}
          >
            {showRiskOnly ? "Show All" : "Risk Paths Only"}
          </button>
          
          <button
            onClick={toggleFullscreen}
            className={cn("p-1.5 ml-1 transition-colors", isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900")}
            title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>

          <button
            onClick={() => void refreshPipeline(true)}
            className={cn("transition-colors ml-1 p-1", isDark ? "text-slate-400 hover:text-white" : "text-slate-500 hover:text-slate-900")}
            title="Refresh graph"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {highlightedPath && highlightedPath.length > 0 && (
        <div className="border-b border-[#FFB800]/30 bg-[#FFB800]/10 px-6 py-2 z-10">
          <div className="flex items-center gap-2 font-mono text-xs text-[#FFB800]">
            <GitBranch className="h-3.5 w-3.5 flex-shrink-0" />
            <span>
              Showing detection pathway for <span className="font-bold">{activeCaseId}</span> - {highlightedPath.length} nodes highlighted in gold
            </span>
          </div>
        </div>
      )}

      <div className="absolute bottom-4 left-4 right-[280px] z-10 pointer-events-none">
         <div className={cn(
           "inline-flex border rounded-xl backdrop-blur-md px-4 py-2 pointer-events-auto shadow-xl",
           isDark ? "border-slate-700/50 bg-[#0b1121]/80" : "border-slate-200 bg-white/80"
         )}>
           <Legend nodeTypeCounts={nodeTypeCounts} isDark={isDark} />
         </div>
      </div>

      {orderedNodeTypes.length > 0 && phase < orderedNodeTypes.length && (
        <div className={cn(
          "border-b px-6 py-1.5 z-10",
          isDark ? "border-slate-800/50 bg-[#0b1121]/90" : "border-slate-200 bg-white/90"
        )}>
          <div className={cn("flex gap-1.5 font-mono text-[10px]", isDark ? "text-slate-500" : "text-slate-400")}>
             <span className="text-emerald-400 font-bold mr-2">LOADING TOPOLOGY:</span>
            {orderedNodeTypes.map((type, index) => (
              <span
                key={type}
                className={cn(
                  "flex items-center gap-1 rounded px-2 py-0.5 transition-colors border",
                  index < phase 
                    ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" 
                    : (isDark ? "text-slate-600 border-transparent" : "text-slate-300 border-transparent"),
                )}
              >
                {index < phase ? "done:" : "wait:"} {type.replace(/_/g, "-")}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className={cn("relative flex-1", isDark ? "bg-[#0b1121]" : "bg-slate-50")}>
        <ReactFlow
          nodes={filteredNodes}
          edges={displayEdges}
          onInit={(instance) => {
            reactFlowRef.current = instance;
            instance.fitView({ padding: 0.12 });
          }}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          colorMode={isDark ? "dark" : "light"}
          proOptions={{ hideAttribution: true }}
          style={{ background: "transparent" }}
          panOnDrag={true}
          selectionOnDrag={false}
          selectNodesOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={true}
          zoomOnPinch={true}
          zoomOnDoubleClick={true}
          nodesDraggable={false}
          nodesConnectable={false}
          onlyRenderVisibleElements={true}
          minZoom={0.05}
          maxZoom={4}
        >
          <Background color={isDark ? "#00D4FF11" : "#00000008"} gap={30} size={1.5} />
          <Controls className={cn("!border-slate-800", isDark ? "!bg-[#1e293b]" : "!bg-white")} />
          <MiniMap
            nodeColor={(node) => {
              if (riskSet.has(node.id)) return "#FF3B5C";
              const nodeType = typeof node.data.node_type === "string" ? node.data.node_type : "unknown";
              return NODE_TYPE_CONFIG[nodeType]?.border ?? "#333";
            }}
            maskColor={isDark ? "rgba(11, 17, 33, 0.8)" : "rgba(255, 255, 255, 0.6)"}
            style={{ 
              background: isDark ? "#0A0B0F" : "#ffffff", 
              border: isDark ? "1px solid #1e293b" : "1px solid #e2e8f0", 
              borderRadius: "12px", 
              overflow: "hidden" 
            }}
            className="!bottom-4 !right-4 !m-0 !absolute"
          />
        </ReactFlow>

        {selectedNode && !selectedVendorSubgraph && (
          <NodeDetail
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
            onOpenInvestigation={onOpenInvestigation}
          />
        )}

        {selectedVendorSubgraph && (
          <div className="absolute inset-y-0 right-0 z-50 w-[380px] overflow-y-auto border-l border-slate-700 bg-[#1e293b] shadow-2xl">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-700 bg-[#1e293b]/95 backdrop-blur px-5 py-4">
              <div>
                <div className="font-mono text-sm font-bold text-blue-400">{selectedVendorSubgraph.vendor_name}</div>
                <div className="font-mono text-xs text-slate-500">{selectedVendorSubgraph.vendor_id}</div>
              </div>
              <button onClick={() => setSelectedVendorSubgraph(null)} className="text-slate-400 hover:text-white">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded border border-slate-700 bg-slate-800/50 p-3 text-center">
                  <div className="font-mono text-xl font-bold text-blue-400">{selectedVendorSubgraph.stats?.nodes ?? 0}</div>
                  <div className="text-xs text-slate-400">Subgraph Nodes</div>
                </div>
                <div className="rounded border border-slate-700 bg-slate-800/50 p-3 text-center">
                  <div className="font-mono text-xl font-bold text-blue-400">{selectedVendorSubgraph.stats?.edges ?? 0}</div>
                  <div className="text-xs text-slate-400">Connections</div>
                </div>
              </div>

              {selectedVendorSubgraph.risk_findings?.length > 0 && (
                <div>
                  <h4 className="mb-2 flex items-center gap-1 font-mono text-xs text-rose-500">
                    <AlertTriangle className="h-3 w-3" /> RISK FINDINGS ({selectedVendorSubgraph.risk_findings.length})
                  </h4>
                  {selectedVendorSubgraph.risk_findings.map((finding, index) => (
                    <div key={index} className="mb-2 rounded border border-rose-500/20 bg-rose-500/10 p-3">
                      <div className="mb-1 font-mono text-xs capitalize text-rose-500">
                        {finding.risk_type?.replace(/_/g, " ")}
                      </div>
                      <div className="text-xs text-slate-300">{finding.policy_violation}</div>
                    </div>
                  ))}
                </div>
              )}

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
