"use client";

import { type ComponentType, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowLeft,
  BadgeCheck,
  Boxes,
  BrainCircuit,
  ChevronRight,
  ClipboardList,
  Database,
  FileSearch,
  GitBranch,
  Scale,
  SearchCheck,
  ShieldCheck,
  ZoomIn,
} from "lucide-react";
import { useTheme } from "next-themes";
import { getPipelineDeepDive } from "@/lib/api";
import {
  PipelineDeepDiveResponse,
  PipelineStageDetail,
  PipelineSubprocessDetail,
} from "@/lib/backend-types";
import { ManualAuditSnapshot } from "@/components/dashboard/manual-audit-snapshot";
import { useDashboardStore } from "@/store/dashboard-store";

type PresentedStage = PipelineStageDetail & {
  icon: ComponentType<{ className?: string }>;
  color: string;
};

const STAGE_VISUALS: Record<string, { icon: ComponentType<{ className?: string }>; color: string }> = {
  sources: { icon: Database, color: "#0984e3" },
  ingestion: { icon: Activity, color: "#00b894" },
  validation: { icon: ShieldCheck, color: "#6c5ce7" },
  extraction: { icon: Boxes, color: "#0984e3" },
  graph: { icon: GitBranch, color: "#a29bfe" },
  decision: { icon: BrainCircuit, color: "#6c5ce7" },
  rules: { icon: Scale, color: "#f39c12" },
  pathway: { icon: SearchCheck, color: "#e17055" },
  risk: { icon: BadgeCheck, color: "#e74c3c" },
  investigation: { icon: FileSearch, color: "#e74c3c" },
  evidence: { icon: ClipboardList, color: "#00b894" },
  monitoring: { icon: Activity, color: "#00b894" },
};

function presentStage(stage: PipelineStageDetail): PresentedStage {
  const visual = STAGE_VISUALS[stage.stage_id] ?? { icon: Activity, color: "#7c8aa5" };
  return { ...stage, ...visual };
}

function formatStatus(status: PipelineSubprocessDetail["status"] | PipelineStageDetail["status"]): string {
  if (status === "completed") return "Completed";
  if (status === "attention") return "Needs attention";
  return "Ready";
}

function statusColor(status: PipelineSubprocessDetail["status"] | PipelineStageDetail["status"]): string {
  if (status === "completed") return "#00b894";
  if (status === "attention") return "#e17055";
  return "#4f6bff";
}

/* ─── SVG Flow Connector ─── */

function FlowConnector({ x1, y1, x2, y2, color }: { x1: number; y1: number; x2: number; y2: number; color: string }) {
  const midX = (x1 + x2) / 2;
  const d = `M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`;
  return (
    <g>
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.12" />
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.5" strokeDasharray="6 4" style={{ animation: "flow-dash 1.5s linear infinite" }} />
    </g>
  );
}

/* ─── SVG Flow Node ─── */

function FlowNode({
  stage,
  x,
  y,
  onClick,
  metricValue,
  isDark,
}: {
  stage: PresentedStage;
  x: number;
  y: number;
  onClick: () => void;
  metricValue: string;
  isDark: boolean;
}) {
  const Icon = stage.icon;
  const w = 140;
  const h = 72;
  const cardFill = isDark ? "#171b31" : "#ffffff";
  const titleFill = isDark ? "#f5f7ff" : "#0f172a";
  const metricFill = isDark ? "#b4c0da" : "#64748b";
  const iconToneFill = `${stage.color}${isDark ? "24" : "18"}`;
  const zoomFill = isDark ? "#9fb0d3" : "#64748b";
  return (
    <motion.g initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }} style={{ cursor: "pointer" }} onClick={onClick}>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={16} fill={cardFill} stroke={stage.color} strokeWidth={1.5} strokeOpacity={isDark ? 0.55 : 0.3} />
      <circle cx={x - w / 2 + 24} cy={y} r={12} fill={iconToneFill} />
      <foreignObject x={x - w / 2 + 14} y={y - 10} width={20} height={20}>
        <div style={{ color: stage.color }}><Icon className="h-[18px] w-[18px]" /></div>
      </foreignObject>
      <text x={x - w / 2 + 44} y={y - 8} fill={titleFill} fontSize="10.5" fontWeight="600" fontFamily="Inter, sans-serif">{stage.short_title}</text>
      <text x={x - w / 2 + 44} y={y + 10} fill={metricFill} fontSize="9" fontFamily="Inter, sans-serif">{metricValue}</text>
      <foreignObject x={x + w / 2 - 22} y={y - h / 2 + 6} width={16} height={16}>
        <div style={{ color: zoomFill }}><ZoomIn className="h-4 w-4" /></div>
      </foreignObject>
    </motion.g>
  );
}

/* ─── Graphical Sub-Process Flow ─── */

function SubProcessFlow({
  subprocesses,
  color,
  isDark,
}: {
  subprocesses: PipelineSubprocessDetail[];
  color: string;
  isDark: boolean;
}) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
  const cardFill = isDark ? "#171b31" : "#ffffff";
  const titleFill = isDark ? "#f5f7ff" : "#0f172a";
  const detailFill = isDark ? "#b4c0da" : "#64748b";
  const arrowFill = isDark ? "#9fb0d3" : "#64748b";

  const nodeW = 324;
  const standardNodeH = 84;
  const expandedNodeH = 186;
  const gapY = 16;
  const startX = 52;
  const startY = 22;
  const layout = subprocesses.reduce<{
    currentY: number;
    nodes: Array<{ sp: PipelineSubprocessDetail; i: number; isExpanded: boolean; nodeH: number; cy: number }>;
  }>((acc, sp, i) => {
    const isExpanded = expandedIndex === i;
    const nodeH = isExpanded ? expandedNodeH : standardNodeH;
    const cy = acc.currentY + nodeH / 2;
    return {
      currentY: acc.currentY + nodeH + gapY,
      nodes: [...acc.nodes, { sp, i, isExpanded, nodeH, cy }],
    };
  }, { currentY: startY, nodes: [] });

  const nodesLayout = layout.nodes;
  const finalY = layout.currentY - gapY;
  const lastNode = nodesLayout[nodesLayout.length - 1];
  const connectorEndY = lastNode ? lastNode.cy : startY + standardNodeH / 2;

  return (
    <svg viewBox={`0 0 612 ${finalY + 38}`} className="mx-auto h-auto w-full max-w-[612px] drop-shadow-sm font-sans">
      {/* Vertical connector line */}
      <line x1={startX} y1={startY + standardNodeH / 2} x2={startX} y2={connectorEndY} stroke={color} strokeWidth="2" strokeOpacity="0.12" strokeDasharray="4 3" />

      {nodesLayout.map(({ sp, i, isExpanded, nodeH, cy }) => {
        return (
          <g key={sp.name} onClick={() => setExpandedIndex(isExpanded ? null : i)} className="cursor-pointer transition-all duration-300 hover:opacity-95">
            {/* Connector dot on line */}
            <circle cx={startX} cy={cy} r={4.5} fill={color} fillOpacity={isExpanded ? 0.3 : 0.15} stroke={color} strokeWidth={1.5} />
            <circle cx={startX} cy={cy} r={isExpanded ? 3 : 2} fill={color} />

            {/* Horizontal connector */}
            <line x1={startX + 4.5} y1={cy} x2={startX + 20} y2={cy} stroke={color} strokeWidth="1.5" strokeOpacity={isExpanded ? 0.5 : 0.25} />

            {/* Sub-process card */}
            <rect x={startX + 20} y={cy - nodeH / 2} width={nodeW} height={nodeH} rx={14} fill={cardFill} stroke={color} strokeWidth={isExpanded ? 1.5 : 1} strokeOpacity={isExpanded ? (isDark ? 0.82 : 0.6) : (isDark ? 0.42 : 0.2)} />

            {/* Expanded Detailed Background */}
            {isExpanded && (
              <rect x={startX + 21} y={cy - nodeH / 2 + 86} width={nodeW - 2} height={nodeH - 87} rx={12} fill={`${color}${isDark ? "10" : "05"}`} />
            )}

            {/* Number badge */}
            <rect x={startX + 30} y={cy - nodeH / 2 + 16} width={24} height={20} rx={6} fill={`${color}${isExpanded ? '25' : '15'}`} />
            <text x={startX + 42} y={cy - nodeH / 2 + 30} textAnchor="middle" fill={color} fontSize="10" fontWeight="700" fontFamily="Inter, sans-serif">
              {String(i + 1).padStart(2, "0")}
            </text>

            {/* Name */}
            <text x={startX + 66} y={cy - nodeH / 2 + 30} fill={isExpanded ? color : titleFill} fontSize="13" fontWeight="600" fontFamily="Inter, sans-serif">
              {sp.name}
            </text>

            {/* Detail */}
            <foreignObject x={startX + 66} y={cy - nodeH / 2 + 38} width={nodeW - 82} height={44}>
              <div style={{ color: detailFill, fontSize: "11px", fontFamily: "Inter, sans-serif", lineHeight: "1.5", overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 3, WebkitBoxOrient: "vertical", whiteSpace: "normal" }}>
                {sp.detail}
              </div>
            </foreignObject>

            {/* Extra Expanded Info */}
            {isExpanded && (
              <foreignObject x={startX + 30} y={cy - nodeH / 2 + 96} width={nodeW - 34} height={74}>
                <div style={{ color: detailFill, fontSize: "10.5px", fontFamily: "Inter, sans-serif", lineHeight: "1.5", display: "flex", flexDirection: "column", gap: "5px" }}>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: titleFill }}>Execution Status:</strong>{" "}
                    <span style={{ color: statusColor(sp.status) }}>● {formatStatus(sp.status)}</span>
                  </p>
                  <p style={{ margin: 0 }}>
                    <strong style={{ color: titleFill }}>Audit Trace:</strong>{" "}
                    <code style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{sp.audit_trace || "trace not supplied"}</code>
                  </p>
                  <p style={{ margin: 0, overflowWrap: "anywhere" }}><strong style={{ color: titleFill }}>Evidence:</strong> {sp.evidence_refs.length ? sp.evidence_refs.join(", ") : "No linked evidence refs"}</p>
                </div>
              </foreignObject>
            )}

            {/* Arrow indicator */}
            <foreignObject x={startX + nodeW - 6} y={cy - nodeH / 2 + 22} width={16} height={16}>
              <div style={{ color: isExpanded ? color : arrowFill, opacity: isExpanded ? 1 : 0.7, transform: isExpanded ? "rotate(90deg)" : "none", transition: "transform 0.3s" }}><ChevronRight className="h-4 w-4" /></div>
            </foreignObject>
          </g>
        );
      })}
    </svg>
  );
}

/* ─── Zoomed Sub-Pipeline View ─── */

function SubPipelineView({
  stage,
  metrics: stageMetricsData,
  vendorNames,
  actorNames,
  onBack,
  isDark,
}: {
  stage: PresentedStage;
  metrics: Array<{ label: string; value: string }>;
  vendorNames: string[];
  actorNames: string[];
  onBack: () => void;
  isDark: boolean;
}) {
  const Icon = stage.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97, y: -8 }}
      transition={{ duration: 0.4 }}
      className="flex h-full flex-col"
    >
      {/* Breadcrumb */}
      <div className="mb-4 flex items-center gap-2">
        <button onClick={onBack} className="pro-button text-[11px]">
          <ArrowLeft className="h-3 w-3" />
          Pipeline
        </button>
        <ChevronRight className="h-3 w-3 text-[var(--text-muted)]" />
        <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold" style={{ color: stage.color, background: `${stage.color}12` }}>
          <Icon className="h-3 w-3" />
          {stage.title}
        </span>
      </div>

      {/* Title & Purpose */}
      <div className="mb-4">
        <h3 className="text-lg font-bold tracking-tight">{stage.title}</h3>
        <p className="mt-1 text-sm text-[var(--text-muted)]">{stage.purpose}</p>
      </div>

      {/* Metrics */}
      <div className="mb-5 grid grid-cols-2 gap-2 xl:grid-cols-4">
        {stageMetricsData.map((m) => (
          <div key={m.label} className="rounded-2xl bg-[var(--background)] px-3 py-2.5">
            <p className="text-[9px] font-bold tracking-widest text-[var(--text-muted)] uppercase">{m.label}</p>
            <p className="mt-1 text-sm font-bold">{m.value}</p>
          </div>
        ))}
      </div>

      {/* ── Graphical Sub-Processes (SVG Flow) ── */}
      <p className="panel-title mb-2">SUB-PROCESSES</p>
      <div className="mb-5 neo-card flex h-full min-h-[486px] w-full items-start justify-center overflow-x-auto px-4 py-5 shadow-none">
        {stage.subprocesses.length ? (
          <SubProcessFlow subprocesses={stage.subprocesses} color={stage.color} isDark={isDark} />
        ) : (
          <div className="flex min-h-[260px] w-full items-center justify-center text-sm text-[var(--text-muted)]">
            No backend sub-process detail is currently available for this stage.
          </div>
        )}
      </div>

      {/* Real Data Panels */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div className="neo-card px-4 py-3">
          <p className="panel-title mb-2">Vendors in Graph</p>
          {vendorNames.length ? (
            <div className="flex flex-wrap gap-1.5">
              {vendorNames.map((v) => (
                <span key={v} className="rounded-full bg-[#00b894]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[#00b894]">{v}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No vendor data available</p>
          )}
        </div>
        <div className="neo-card px-4 py-3">
          <p className="panel-title mb-2">Actors / Employees</p>
          {actorNames.length ? (
            <div className="flex flex-wrap gap-1.5">
              {actorNames.map((a) => (
                <span key={a} className="rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-[10px] font-semibold text-[var(--primary)]">{a}</span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">No actor data available</p>
          )}
        </div>
        <div className="neo-card px-4 py-3">
          <p className="panel-title mb-2">Compliance</p>
          <p className="text-xs text-[var(--text-muted)]">
            Stage status: <span className="font-bold" style={{ color: statusColor(stage.status) }}>{formatStatus(stage.status)}</span>
          </p>
          <p className="mt-2 text-xs text-[var(--text-muted)]">{stage.summary}</p>
          {stage.operations.length ? (
            <ul className="mt-3 space-y-1 text-[11px] text-[var(--text-muted)]">
              {stage.operations.slice(0, 4).map((item) => (
                <li key={item}>• {item}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}

/* ─── Main Pipeline Console ─── */

export function AuditorPipelineConsole() {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const token = useDashboardStore((state) => state.token);
  const status = useDashboardStore((state) => state.status);

  const [activeStage, setActiveStage] = useState<string | null>(null);
  const [deepDive, setDeepDive] = useState<PipelineDeepDiveResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!token || status !== "ready") {
      return;
    }

    let cancelled = false;
    const loadDeepDive = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const response = await getPipelineDeepDive(token);
        if (!cancelled) {
          setDeepDive(response);
        }
      } catch (error) {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load backend pipeline details.");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void loadDeepDive();
    return () => {
      cancelled = true;
    };
  }, [status, token]);

  const stages = useMemo(() => (deepDive?.stages ?? []).map((stage) => presentStage(stage)), [deepDive]);
  const selectedStage = activeStage ? stages.find((stage) => stage.stage_id === activeStage) ?? null : null;
  const selectedMetrics = selectedStage?.metrics ?? [];
  const getFirstMetricValue = (stage: PresentedStage): string =>
    stage.metrics.length ? `${stage.metrics[0].label}: ${stage.metrics[0].value}` : stage.summary;

  /* 3 rows × 4 cols layout */
  const nodePositions = useMemo(() => {
    const cols = 4;
    const gapX = 200;
    const gapY = 110;
    const startX = 100;
    const startY = 55;
    return stages.map((_, i) => ({ x: startX + (i % cols) * gapX, y: startY + Math.floor(i / cols) * gapY }));
  }, [stages]);

  const svgWidth = 900;
  const svgHeight = Math.max(350, Math.ceil(Math.max(stages.length, 1) / 4) * 110 + 90);
  const gridStroke = isDark ? "rgba(132, 151, 192, 0.14)" : "#e0e4ec";

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* Header */}
      <section className="neo-card px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-2 text-[10px] font-bold tracking-[0.14em] text-[var(--primary)]">
              <span className="h-px w-6 bg-gradient-to-r from-[var(--primary)] to-transparent" />
              SYSTEM PIPELINE
            </p>
            <h3 className="mt-1.5 text-lg font-bold tracking-tight">Audit Pipeline Flow</h3>
          </div>
          <span className="status-pill text-[10px]">
            <span className="h-1.5 w-1.5 rounded-full bg-[#00b894] pulse-dot" />
            {isLoading ? "Loading backend flow" : `${stages.length} Stages Active`}
          </span>
        </div>
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          Click any stage to inspect the live backend-derived sub-processes, audit traces, and evidence references.
        </p>
      </section>

      {/* Flow Diagram or Zoomed Sub-Pipeline */}
      <section className="neo-card min-h-0 flex-1 overflow-hidden p-5">
        <div className="custom-scrollbar h-full overflow-auto">
          <AnimatePresence mode="wait">
            {selectedStage ? (
              <SubPipelineView
                key={`sub-${selectedStage.stage_id}`}
                stage={selectedStage}
                metrics={selectedMetrics}
                vendorNames={deepDive?.vendor_names ?? []}
                actorNames={deepDive?.actor_names ?? []}
                onBack={() => setActiveStage(null)}
                isDark={isDark}
              />
            ) : isLoading && stages.length === 0 ? (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-[320px] items-center justify-center text-sm text-[var(--text-muted)]">
                Loading backend pipeline deep-dive...
              </motion.div>
            ) : errorMessage && stages.length === 0 ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex h-full min-h-[320px] items-center justify-center rounded-3xl border border-[var(--danger)]/20 bg-[var(--danger)]/5 px-6 text-center text-sm text-[var(--danger)]">
                {errorMessage}
              </motion.div>
            ) : (
              <motion.div key="flow-overview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.3 }}>
                <svg ref={svgRef} viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full" style={{ minHeight: 320 }}>
                  {/* Background grid */}
                  <defs>
                    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                      <path d="M 40 0 L 0 0 0 40" fill="none" stroke={gridStroke} strokeWidth="0.5" strokeOpacity={isDark ? "1" : "0.4"} />
                    </pattern>
                  </defs>
                  <rect width={svgWidth} height={svgHeight} fill="url(#grid)" />

                  {/* Connectors */}
                  {stages.map((stage, i) => {
                    if (i === stages.length - 1) return null;
                    const from = nodePositions[i];
                    const to = nodePositions[i + 1];
                    const sameRow = Math.floor(i / 4) === Math.floor((i + 1) / 4);
                    return (
                      <FlowConnector
                        key={`conn-${stage.stage_id}`}
                        x1={from.x + (sameRow ? 70 : 0)}
                        y1={from.y + (sameRow ? 0 : 36)}
                        x2={to.x - (sameRow ? 70 : 0)}
                        y2={to.y - (sameRow ? 0 : -36)}
                        color={stage.color}
                      />
                    );
                  })}

                  {/* Nodes */}
                  {stages.map((stage, i) => (
                    <FlowNode key={stage.stage_id} stage={stage} x={nodePositions[i].x} y={nodePositions[i].y} onClick={() => setActiveStage(stage.stage_id)} metricValue={getFirstMetricValue(stage)} isDark={isDark} />
                  ))}
                </svg>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>

      <ManualAuditSnapshot
        title="Manual Review Queue"
        description="Manual audits are surfaced directly below the live pipeline so human findings can be compared against the automated flow without leaving the console."
        maxItems={4}
      />
    </div>
  );
}
