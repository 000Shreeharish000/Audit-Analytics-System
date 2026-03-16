"use client";

import {
  useEffect,
  useRef,
  useMemo,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import { useTheme } from "next-themes";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";

/* ─────────────────────────── types ─────────────────────────── */
interface GNode {
  id: string;
  label: string;
  type: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  risk: boolean;
  fixed: boolean;
}
interface GEdge {
  src: string;
  tgt: string;
  isPath: boolean;
}

/* ─────────────────────────── palette ───────────────────────── */
const LIGHT: Record<string, { fill: string; stroke: string; text: string }> = {
  Vendor:   { fill: "#e8f4fd", stroke: "#3b82f6", text: "#1e40af" },
  Employee: { fill: "#f0fdf4", stroke: "#16a34a", text: "#14532d" },
  Invoice:  { fill: "#fefce8", stroke: "#d97706", text: "#713f12" },
  Approval: { fill: "#f5f3ff", stroke: "#7c3aed", text: "#4c1d95" },
  Payment:  { fill: "#fff7ed", stroke: "#ea580c", text: "#7c2d12" },
  Decision: { fill: "#fef2f2", stroke: "#dc2626", text: "#991b1b" },
  Case:     { fill: "#fdf4ff", stroke: "#9333ea", text: "#581c87" },
  Rule:     { fill: "#f0fdfa", stroke: "#0d9488", text: "#134e4a" },
  default:  { fill: "#f8fafc", stroke: "#64748b", text: "#334155" },
};
const DARK: Record<string, { fill: string; stroke: string; text: string }> = {
  Vendor:   { fill: "#1e3a5f", stroke: "#60a5fa", text: "#bfdbfe" },
  Employee: { fill: "#14532d", stroke: "#4ade80", text: "#bbf7d0" },
  Invoice:  { fill: "#422006", stroke: "#fbbf24", text: "#fef08a" },
  Approval: { fill: "#2e1065", stroke: "#a78bfa", text: "#ddd6fe" },
  Payment:  { fill: "#431407", stroke: "#fb923c", text: "#fed7aa" },
  Decision: { fill: "#450a0a", stroke: "#f87171", text: "#fecaca" },
  Case:     { fill: "#3b0764", stroke: "#c084fc", text: "#f3e8ff" },
  Rule:     { fill: "#042f2e", stroke: "#2dd4bf", text: "#99f6e4" },
  default:  { fill: "#1e293b", stroke: "#475569", text: "#94a3b8" },
};

function typeOf(t = ""): string {
  const v = t.toLowerCase();
  if (v.includes("vendor")) return "Vendor";
  if (v.includes("employee") || v === "emp") return "Employee";
  if (v.includes("invoice")) return "Invoice";
  if (v.includes("approval")) return "Approval";
  if (v.includes("payment")) return "Payment";
  if (v.includes("decision")) return "Decision";
  if (v.includes("case")) return "Case";
  if (v.includes("rule")) return "Rule";
  return "default";
}

function safe(n: number): number {
  return isFinite(n) && !isNaN(n) ? n : 0;
}

/* ─────────────────────────── force sim ─────────────────────── */
function simulate(nodes: GNode[], edges: GEdge[], W: number, H: number): void {
  if (nodes.length === 0) return;
  const cx = W / 2, cy = H / 2;
  const k = Math.sqrt((W * H) / Math.max(nodes.length, 1)) * 0.9;

  for (let iter = 0; iter < 200; iter++) {
    const alpha = Math.max(0.01, 1 - iter / 200);

    // repulsion
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        if (a.fixed && b.fixed) continue;
        const dx = safe(b.x - a.x) || (Math.random() - 0.5) * 0.1;
        const dy = safe(b.y - a.y) || (Math.random() - 0.5) * 0.1;
        const d2 = dx * dx + dy * dy;
        const dist = Math.sqrt(d2) || 0.01;
        const force = (k * k) / dist * alpha * 0.5;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.fixed) { a.vx -= fx; a.vy -= fy; }
        if (!b.fixed) { b.vx += fx; b.vy += fy; }
      }
    }

    // attraction along edges
    const nodeMap = new Map(nodes.map(n => [n.id, n]));
    for (const e of edges) {
      const a = nodeMap.get(e.src), b = nodeMap.get(e.tgt);
      if (!a || !b) continue;
      const dx = safe(b.x - a.x);
      const dy = safe(b.y - a.y);
      const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const ideal = e.isPath ? k * 0.7 : k;
      const force = (dist - ideal) / dist * alpha * 0.25;
      if (!a.fixed) { a.vx += dx * force; a.vy += dy * force; }
      if (!b.fixed) { b.vx -= dx * force; b.vy -= dy * force; }
    }

    // gravity + dampen + clamp
    for (const n of nodes) {
      if (n.fixed) continue;
      n.vx = safe(n.vx) + (cx - n.x) * 0.02 * alpha;
      n.vy = safe(n.vy) + (cy - n.y) * 0.02 * alpha;
      n.vx *= 0.72;
      n.vy *= 0.72;
      n.x = Math.max(40, Math.min(W - 40, safe(n.x + n.vx)));
      n.y = Math.max(30, Math.min(H - 30, safe(n.y + n.vy)));
    }
  }
}

/* ─────────────────────────── component ─────────────────────── */
export function LiveNetworkGraph() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const pal = isDark ? DARK : LIGHT;

  const graph = useDashboardStore(s => s.graph);
  const cases = useDashboardStore(s => s.cases);
  const activeCaseId = useDashboardStore(s => s.activeCaseId);
  const openInvestigation = useDashboardStore(s => s.openInvestigation);

  const containerRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 800, h: 460 });

  // track real container size
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      if (width > 0 && height > 0) setSize({ w: width, h: height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [nodes, setNodes] = useState<GNode[]>([]);
  const [edges, setEdges] = useState<GEdge[]>([]);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [panOrigin, setPanOrigin] = useState<{ mx: number; my: number; px: number; py: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState("");

  const activeCase = cases.find(c => c.case_id === activeCaseId);
  const pathSet = useMemo(() => new Set(activeCase?.path_nodes ?? []), [activeCase]);

  // rebuild when graph/filter/pathSet changes
  useEffect(() => {
    if (!graph?.nodes?.length || size.w === 0) return;

    const rawNodes = filterType
      ? graph.nodes.filter(n => typeOf(n.type) === filterType)
      : graph.nodes.slice(0, 120); // cap at 120 for clarity

    const nodeIds = new Set(rawNodes.map(n => String(n.id)));

    const ns: GNode[] = rawNodes.map(n => ({
      id: String(n.id),
      label: String(n.label ?? n.id).slice(0, 12),
      type: typeOf(n.type),
      x: 40 + Math.random() * (size.w - 80),
      y: 30 + Math.random() * (size.h - 60),
      vx: 0,
      vy: 0,
      risk: pathSet.has(String(n.id)),
      fixed: false,
    }));

    const es: GEdge[] = (graph.edges ?? [])
      .filter(e => nodeIds.has(String(e.source)) && nodeIds.has(String(e.target)))
      .slice(0, 250)
      .map(e => ({
        src: String(e.source),
        tgt: String(e.target),
        isPath: pathSet.has(String(e.source)) && pathSet.has(String(e.target)),
      }));

    simulate(ns, es, size.w, size.h);
    setNodes(ns);
    setEdges(es);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setLastRefresh(new Date().toLocaleTimeString());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, filterType, pathSet, size.w]);

  const svgRef = useRef<SVGSVGElement>(null);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.15, Math.min(5, z * (e.deltaY > 0 ? 0.92 : 1.09))));
  }, []);

  function svgCoords(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top  - pan.y) / zoom,
    };
  }

  function onMouseDown(e: React.MouseEvent<SVGSVGElement>) {
    const target = (e.target as SVGElement).closest("[data-nid]") as SVGElement | null;
    if (target) {
      setDraggingId(target.dataset.nid ?? null);
    } else {
      setPanOrigin({ mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y });
    }
  }

  function onMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    if (draggingId) {
      const { x, y } = svgCoords(e.clientX, e.clientY);
      setNodes(prev => prev.map(n =>
        n.id === draggingId ? { ...n, x: Math.max(40, Math.min(size.w - 40, x)), y: Math.max(30, Math.min(size.h - 30, y)), vx: 0, vy: 0, fixed: true } : n
      ));
    } else if (panOrigin) {
      setPan({ x: panOrigin.px + (e.clientX - panOrigin.mx), y: panOrigin.py + (e.clientY - panOrigin.my) });
    }
  }

  function onMouseUp() {
    setDraggingId(null);
    setPanOrigin(null);
  }

  const allTypes = useMemo(() => [...new Set(nodes.map(n => n.type))].sort(), [nodes]);

  const bg = isDark ? "#0d1117" : "#f8fafc";
  const gridStroke = isDark ? "rgba(100,120,160,0.08)" : "rgba(0,0,0,0.05)";
  const edgeNormal = isDark ? "rgba(148,163,184,0.22)" : "rgba(148,163,184,0.45)";
  const edgePath   = isDark ? "#a78bfa" : "#6c5ce7";

  const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  return (
    <div className="flex h-full min-h-[480px] flex-col overflow-hidden rounded-[20px] border border-[var(--card-border)] bg-[var(--card-bg)]">
      {/* ── header ── */}
      <div className="flex shrink-0 items-center gap-3 border-b border-[var(--card-border)] px-5 py-3.5">
        <div>
          <p className="text-[13px] font-bold">Financial Network Graph</p>
          <p className="text-[11px] text-[var(--text-muted)]">
            Live · {nodes.length} nodes · {edges.length} links
            {lastRefresh ? ` · ${lastRefresh}` : ""}
          </p>
        </div>
        <div className="flex-1" />

        {/* type filter chips */}
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilterType(null)}
            className={`rounded-full px-2.5 py-1 text-[10px] font-bold transition-all ${!filterType ? "bg-[var(--primary)] text-white shadow-sm" : "bg-[var(--background)] text-[var(--text-muted)] hover:text-[var(--foreground)]"}`}>
            All
          </button>
          {allTypes.map(t => {
            const p = pal[t] ?? pal.default;
            return (
              <button key={t} onClick={() => setFilterType(t === filterType ? null : t)}
                className="rounded-full px-2.5 py-1 text-[10px] font-bold border transition-all hover:opacity-80"
                style={filterType === t
                  ? { background: p.stroke, color: "#fff" }
                  : { background: p.fill, color: p.text, borderColor: `${p.stroke}50` }}>
                {t}
              </button>
            );
          })}
        </div>

        {/* zoom controls */}
        <div className="flex items-center gap-0.5">
          {[{ icon: ZoomIn, fn: () => setZoom(z => Math.min(5, z * 1.3)), title: "Zoom in" },
            { icon: ZoomOut, fn: () => setZoom(z => Math.max(0.15, z / 1.3)), title: "Zoom out" },
            { icon: RotateCcw, fn: () => { setZoom(1); setPan({ x: 0, y: 0 }); }, title: "Reset" },
          ].map(({ icon: Icon, fn, title }) => (
            <button key={title} onClick={fn} title={title}
              className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)] transition-colors">
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>

      {/* ── legend ── */}
      {allTypes.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-1 border-b border-[var(--card-border)] bg-[var(--background)] px-5 py-2">
          {allTypes.map(t => {
            const p = pal[t] ?? pal.default;
            return (
              <span key={t} className="flex items-center gap-1.5 text-[11px] font-medium" style={{ color: p.text }}>
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.stroke }} />
                {t}
              </span>
            );
          })}
          <span className="flex items-center gap-1.5 text-[11px] font-medium text-red-500 ml-auto">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400" /> Risk Path
          </span>
        </div>
      )}

      {/* ── canvas ── */}
      <div ref={containerRef} className="relative min-h-0 flex-1" style={{ background: bg }}>
        {nodes.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-14 w-14 animate-pulse rounded-2xl border-2 border-dashed border-[var(--card-border)]" />
              <p className="text-sm font-semibold text-[var(--foreground)]">No network data</p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">Load a dataset to build the graph</p>
            </div>
          </div>
        ) : (
          <svg
            ref={svgRef}
            width={size.w}
            height={size.h}
            style={{ display: "block", cursor: draggingId ? "grabbing" : panOrigin ? "grabbing" : "grab" }}
            onWheel={handleWheel}
            onMouseDown={onMouseDown}
            onMouseMove={onMouseMove}
            onMouseUp={onMouseUp}
            onMouseLeave={onMouseUp}
          >
            <defs>
              <pattern id="lg2" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M30 0L0 0 0 30" fill="none" stroke={gridStroke} strokeWidth="0.5" />
              </pattern>
              <marker id="arr" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M0,1 L8,4 L0,7 Z" fill={edgeNormal} />
              </marker>
              <marker id="arr-p" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
                <path d="M0,1 L8,4 L0,7 Z" fill={edgePath} />
              </marker>
            </defs>

            <rect width={size.w} height={size.h} fill={`url(#lg2)`} />

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              {/* edges */}
              {edges.map((e, i) => {
                const a = nodeMap.get(e.src), b = nodeMap.get(e.tgt);
                if (!a || !b) return null;
                const ax = safe(a.x), ay = safe(a.y), bx = safe(b.x), by = safe(b.y);
                const mx = (ax + bx) / 2, my = (ay + by) / 2 - 12;
                const faded = hovered !== null && hovered !== e.src && hovered !== e.tgt;
                return (
                  <path
                    key={i}
                    d={`M${ax},${ay} Q${mx},${my} ${bx},${by}`}
                    fill="none"
                    stroke={e.isPath ? edgePath : edgeNormal}
                    strokeWidth={e.isPath ? 2 : 0.9}
                    markerEnd={e.isPath ? "url(#arr-p)" : "url(#arr)"}
                    opacity={faded ? 0.15 : 1}
                  />
                );
              })}

              {/* nodes */}
              {nodes.map(n => {
                const p = pal[n.type] ?? pal.default;
                const nx = safe(n.x), ny = safe(n.y);
                const faded = hovered !== null && hovered !== n.id;
                const rx = 30, ry = 13;
                return (
                  <g
                    key={n.id}
                    data-nid={n.id}
                    transform={`translate(${nx},${ny})`}
                    style={{ cursor: "pointer", opacity: faded ? 0.35 : 1 }}
                    onMouseEnter={() => setHovered(n.id)}
                    onMouseLeave={() => setHovered(null)}
                    onClick={() => { if (n.type === "Case") void openInvestigation(n.id); }}
                  >
                    {/* shadow */}
                    {hovered === n.id && <ellipse cx={0} cy={ry + 5} rx={rx} ry={5} fill="rgba(0,0,0,0.1)" />}
                    {/* body */}
                    <ellipse
                      cx={0} cy={0} rx={rx} ry={ry}
                      fill={n.risk ? (isDark ? "#450a0a" : "#fef2f2") : p.fill}
                      stroke={n.risk ? "#dc2626" : p.stroke}
                      strokeWidth={n.risk || hovered === n.id ? 2 : 1.2}
                    />
                    {/* label */}
                    <text
                      textAnchor="middle" dominantBaseline="middle"
                      fontSize={hovered === n.id ? 8.5 : 7.5}
                      fontWeight="600"
                      fill={n.risk ? "#dc2626" : p.text}
                      style={{ pointerEvents: "none", fontFamily: "Inter,sans-serif", userSelect: "none" }}
                    >
                      {n.label}
                    </text>
                    {/* type tag on hover */}
                    {hovered === n.id && (
                      <text y={-ry - 7} textAnchor="middle" fontSize={6.5} fontWeight="700"
                        fill={p.stroke} style={{ pointerEvents: "none", fontFamily: "Inter,sans-serif" }}>
                        {n.type.toUpperCase()}
                      </text>
                    )}
                    {/* risk dot */}
                    {n.risk && (
                      <circle cx={rx - 5} cy={-ry + 5} r={4.5} fill="#dc2626" stroke="#fff" strokeWidth={1.5} />
                    )}
                  </g>
                );
              })}
            </g>
          </svg>
        )}
      </div>

      {/* ── footer ── */}
      {nodes.length > 0 && (
        <div className="flex shrink-0 flex-wrap items-center gap-x-5 gap-y-0.5 border-t border-[var(--card-border)] px-5 py-2.5 text-[11px]">
          {[
            ["Vendors", nodes.filter(n => n.type === "Vendor").length, "#3b82f6"],
            ["Employees", nodes.filter(n => n.type === "Employee").length, "#16a34a"],
            ["Invoices", nodes.filter(n => n.type === "Invoice").length, "#d97706"],
            ["Risk", nodes.filter(n => n.risk).length, "#dc2626"],
          ].map(([label, count, color]) => (
            <span key={String(label)} className="font-medium" style={{ color: color as string }}>
              <span className="font-bold">{String(count)}</span> {label}
            </span>
          ))}
          <span className="ml-auto text-[10px] text-[var(--text-muted)]">
            Scroll=zoom · Drag=pan · Drag nodes to reposition · Click Case node to investigate
          </span>
        </div>
      )}
    </div>
  );
}
