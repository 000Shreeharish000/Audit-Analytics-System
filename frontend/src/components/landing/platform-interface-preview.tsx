"use client";

import { motion } from "framer-motion";

const EVENTS = [
  "Vendor V301 created",
  "Invoice I9002 issued",
  "Approval threshold exceeded",
  "Rule LOW_APPROVAL triggered",
  "Control bypass chain detected",
];

const RADAR_NODES = [
  { id: "n1", label: "EMP-12", x: 130, y: 90, tone: "#4f6bff" },
  { id: "n2", label: "V301", x: 190, y: 180, tone: "#7be0ff" },
  { id: "n3", label: "I9002", x: 282, y: 142, tone: "#facc15" },
  { id: "n4", label: "APPR-8", x: 350, y: 86, tone: "#60a5fa" },
  { id: "n5", label: "P7002", x: 420, y: 188, tone: "#8b5cf6" },
  { id: "n6", label: "RULE-21", x: 360, y: 256, tone: "#7be0ff" },
  { id: "n7", label: "CASE-041", x: 250, y: 270, tone: "#ff4d4f" },
];

const RADAR_EDGES: Array<[string, string]> = [
  ["n1", "n2"],
  ["n2", "n3"],
  ["n3", "n4"],
  ["n4", "n5"],
  ["n3", "n6"],
  ["n6", "n7"],
  ["n5", "n7"],
];

const RISK_CHAIN: Array<[string, string]> = [
  ["n2", "n3"],
  ["n3", "n6"],
  ["n6", "n7"],
];

function nodeById(id: string) {
  return RADAR_NODES.find((node) => node.id === id);
}

export function PlatformInterfacePreview() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-20">
      <div className="mb-12 max-w-3xl">
        <p className="panel-title mb-4">Platform Interface</p>
        <h2 className="text-3xl md:text-5xl">One cockpit for events, graph, and findings.</h2>
      </div>

      <div className="glass-surface rounded-[24px] p-5 md:p-7">
        <div className="grid gap-4 xl:grid-cols-[21%_56%_23%]">
          <div className="rounded-2xl border border-border/70 bg-panel/60 p-4 backdrop-blur-xl">
            <p className="panel-title mb-3">Event Stream</p>
            <div className="space-y-2 text-xs text-[color:var(--text-muted)]">
              {EVENTS.map((event, index) => (
                <motion.div
                  key={event}
                  initial={{ opacity: 0, x: -8 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.42, delay: index * 0.07, ease: [0.16, 1, 0.3, 1] }}
                  className="rounded-lg border border-border/70 bg-surface/65 px-2.5 py-2"
                >
                  {event}
                </motion.div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-panel/60 p-4 backdrop-blur-xl">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <p className="panel-title">Center Lens Graph</p>
              <span className="rounded-full border border-primary/45 bg-primary/12 px-3 py-1 text-[10px] uppercase tracking-[0.13em]">
                Live Twin Camera
              </span>
            </div>
            <div className="relative h-[340px] overflow-hidden rounded-xl border border-border/70 bg-surface/60">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,107,255,0.22),transparent_64%)]" />
              <svg viewBox="0 0 560 340" className="absolute inset-0 h-full w-full">
                {RADAR_EDGES.map(([sourceId, targetId]) => {
                  const source = nodeById(sourceId);
                  const target = nodeById(targetId);
                  if (!source || !target) {
                    return null;
                  }
                  return (
                    <line
                      key={`${sourceId}-${targetId}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="rgba(139,143,152,0.46)"
                      strokeWidth="1.15"
                    />
                  );
                })}

                {RISK_CHAIN.map(([sourceId, targetId], index) => {
                  const source = nodeById(sourceId);
                  const target = nodeById(targetId);
                  if (!source || !target) {
                    return null;
                  }
                  return (
                    <motion.line
                      key={`risk-${sourceId}-${targetId}`}
                      x1={source.x}
                      y1={source.y}
                      x2={target.x}
                      y2={target.y}
                      stroke="#ff4d4f"
                      strokeWidth="2.1"
                      strokeDasharray="7 6"
                      animate={{ strokeDashoffset: [0, -12] }}
                      transition={{ duration: 1.2, repeat: Infinity, ease: "linear", delay: index * 0.08 }}
                    />
                  );
                })}

                {RADAR_NODES.map((node, index) => (
                  <g key={node.id}>
                    <motion.circle
                      cx={node.x}
                      cy={node.y}
                      r={node.id === "n7" ? 12 : 9}
                      fill={node.tone}
                      animate={{ scale: [1, 1.12, 1], opacity: [0.7, 1, 0.7] }}
                      transition={{ duration: 2.2 + index * 0.2, repeat: Infinity }}
                      style={{ transformBox: "fill-box", transformOrigin: "center" }}
                    />
                    <text x={node.x} y={node.y + 21} fill="rgba(231,231,234,0.88)" fontSize="9" textAnchor="middle">
                      {node.label}
                    </text>
                  </g>
                ))}
              </svg>



              <div className="absolute bottom-3 left-3 rounded-full border border-danger/45 bg-danger/15 px-3 py-1 text-[10px] uppercase tracking-[0.14em] text-danger">
                Dashed red: active risk chain
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-panel/60 p-4 backdrop-blur-xl">
            <p className="panel-title mb-3">Investigation</p>
            <div className="space-y-2 text-xs text-[color:var(--text-muted)]">
              <div className="rounded-lg border border-border/70 bg-surface/70 px-3 py-2">
                <p className="panel-title">Case</p>
                <p className="mt-1 text-sm text-foreground">CASE-2026-041</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-surface/70 px-3 py-2">
                <p className="panel-title">Root Cause</p>
                <p className="mt-1">Near-threshold approvals with repeated actor control.</p>
              </div>
              <div className="rounded-lg border border-danger/40 bg-danger/10 px-3 py-2">
                <p className="panel-title text-danger">Triggered Rule</p>
                <p className="mt-1 text-danger">LOW_APPROVAL_THRESHOLD</p>
              </div>
              <div className="rounded-lg border border-border/70 bg-surface/70 px-3 py-2">
                <p className="panel-title">Confidence</p>
                <p className="mt-1 text-sm text-accent">87%</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
