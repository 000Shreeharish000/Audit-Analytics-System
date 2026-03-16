"use client";

import { motion } from "framer-motion";

type LayerId = "transaction" | "decision" | "control" | "investigation";

type PreviewNode = {
  id: string;
  label: string;
  layer: LayerId;
  x: number;
  y: number;
  type: "employee" | "vendor" | "invoice" | "approval" | "payment" | "rule" | "case";
};

const LAYERS: Array<{ id: LayerId; label: string; x: number }> = [
  { id: "transaction", label: "Transaction Layer", x: 120 },
  { id: "decision", label: "Decision Layer", x: 350 },
  { id: "control", label: "Control Layer", x: 590 },
  { id: "investigation", label: "Investigation Layer", x: 840 },
];

const NODES: PreviewNode[] = [
  { id: "emp", label: "EMP-12", layer: "transaction", x: 120, y: 120, type: "employee" },
  { id: "vend", label: "V301", layer: "transaction", x: 140, y: 260, type: "vendor" },
  { id: "inv1", label: "I9001", layer: "decision", x: 330, y: 150, type: "invoice" },
  { id: "inv2", label: "I9002", layer: "decision", x: 370, y: 290, type: "invoice" },
  { id: "appr", label: "APPR-8", layer: "control", x: 580, y: 165, type: "approval" },
  { id: "pay", label: "P7002", layer: "control", x: 615, y: 290, type: "payment" },
  { id: "rule", label: "RULE_LOW_APPROVAL", layer: "control", x: 610, y: 70, type: "rule" },
  { id: "case", label: "CASE-2026-041", layer: "investigation", x: 840, y: 220, type: "case" },
];

const EDGES: Array<{ source: string; target: string; risk?: boolean }> = [
  { source: "emp", target: "vend" },
  { source: "vend", target: "inv1" },
  { source: "vend", target: "inv2", risk: true },
  { source: "inv1", target: "appr" },
  { source: "inv2", target: "appr", risk: true },
  { source: "inv2", target: "pay", risk: true },
  { source: "appr", target: "rule", risk: true },
  { source: "rule", target: "case", risk: true },
  { source: "pay", target: "case", risk: true },
];

const TYPE_COLORS: Record<PreviewNode["type"], string> = {
  employee: "#4f6bff",
  vendor: "#7be0ff",
  invoice: "#facc15",
  approval: "#60a5fa",
  payment: "#8b5cf6",
  rule: "#7be0ff",
  case: "#ff4d4f",
};

function findNode(nodeId: string): PreviewNode | undefined {
  return NODES.find((node) => node.id === nodeId);
}

export function GraphPreview() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-20">
      <div className="grid gap-8 xl:grid-cols-[0.95fr_1.05fr]">
        <div className="max-w-3xl">
          <p className="panel-title mb-4">Graph Proof</p>
          <h2 className="text-3xl md:text-5xl">The graph resolves into a readable pathway.</h2>
          <p className="mt-5 text-base text-foreground/72 md:text-lg">
            Entities, decisions, controls, and the active case stay in separate lanes so the risk chain is obvious at a glance.
          </p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            {[
              "Actors and vendors",
              "Invoices and decisions",
              "Controls and rule checks",
              "Investigation output",
            ].map((item, index) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.45, delay: index * 0.06, ease: [0.16, 1, 0.3, 1] }}
                className="rounded-2xl border border-border/70 bg-panel/65 px-4 py-3 text-sm text-[color:var(--text-muted)] backdrop-blur-xl"
              >
                {item}
              </motion.div>
            ))}
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
          className="glass-surface relative overflow-hidden rounded-[24px] border border-border/70 p-4 md:p-6"
        >
          <div className="absolute right-5 top-5 rounded-full border border-danger/45 bg-danger/10 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-danger">
            Active suspicious pathway
          </div>

          <svg viewBox="0 0 960 420" className="h-[420px] w-full">
            {LAYERS.map((layer, index) => (
              <g key={layer.id}>
                <text x={layer.x} y={28} fill="rgba(154,160,166,0.92)" fontSize="11" textAnchor="middle" letterSpacing="2">
                  {layer.label.toUpperCase()}
                </text>
                {index < LAYERS.length - 1 ? (
                  <line
                    x1={(layer.x + LAYERS[index + 1].x) / 2}
                    y1={46}
                    x2={(layer.x + LAYERS[index + 1].x) / 2}
                    y2={390}
                    stroke="rgba(139,143,152,0.12)"
                    strokeDasharray="4 10"
                  />
                ) : null}
              </g>
            ))}

            {EDGES.map((edge) => {
              const source = findNode(edge.source);
              const target = findNode(edge.target);
              if (!source || !target) {
                return null;
              }
              return (
                <line
                  key={`${edge.source}-${edge.target}`}
                  x1={source.x}
                  y1={source.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={edge.risk ? "#ff4d4f" : "rgba(139,143,152,0.45)"}
                  strokeWidth={edge.risk ? 2.4 : 1.2}
                  strokeDasharray={edge.risk ? "7 5" : "1 0"}
                  opacity={edge.risk ? 0.95 : 0.55}
                />
              );
            })}

            {EDGES.filter((edge) => edge.risk).map((edge, index) => {
              const source = findNode(edge.source);
              const target = findNode(edge.target);
              if (!source || !target) {
                return null;
              }
              return (
                <motion.circle
                  key={`pulse-${edge.source}-${edge.target}`}
                  r={3}
                  fill="#ff4d4f"
                  animate={{ cx: [source.x, target.x], cy: [source.y, target.y], opacity: [0, 1, 0] }}
                  transition={{ duration: 1.4, repeat: Infinity, ease: "linear", delay: index * 0.14 }}
                />
              );
            })}

            {NODES.map((node, index) => (
              <g key={node.id}>
                <motion.circle
                  cx={node.x}
                  cy={node.y}
                  r={node.type === "case" ? 13 : 10}
                  fill={TYPE_COLORS[node.type]}
                  animate={{ scale: [1, 1.08, 1], opacity: [0.78, 1, 0.78] }}
                  transition={{ duration: 2.2 + (index % 3) * 0.25, repeat: Infinity, delay: index * 0.04 }}
                  style={{ transformBox: "fill-box", transformOrigin: "center" }}
                />
                <text x={node.x} y={node.y + 22} fill="rgba(231,231,234,0.9)" fontSize="10" textAnchor="middle">
                  {node.label}
                </text>
              </g>
            ))}
          </svg>

          <div className="mt-3 flex flex-wrap gap-2 text-[10px] uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
            <span className="rounded-full border border-border/70 bg-panel/70 px-3 py-1">Blue: employee / decision</span>
            <span className="rounded-full border border-border/70 bg-panel/70 px-3 py-1">Cyan: vendor / rule</span>
            <span className="rounded-full border border-border/70 bg-panel/70 px-3 py-1">Yellow: invoice</span>
            <span className="rounded-full border border-border/70 bg-panel/70 px-3 py-1">Purple: payment</span>
            <span className="rounded-full border border-danger/45 bg-danger/10 px-3 py-1 text-danger">Dashed red: risk chain</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
