"use client";

import { motion } from "framer-motion";
import { ArrowDown, BarChart2, BrainCircuit, Database, FileBarChart, LayoutDashboard, Network } from "lucide-react";

const LAYERS = [
  {
    number: "01",
    label: "Data Sources",
    title: "Enterprise Ingestion",
    icon: Database,
    items: ["ERP · HR · Financial records", "Regulatory filings"],
    color: "#6c5ce7",
  },
  {
    number: "02",
    label: "Integration",
    title: "Secure Data Pipeline",
    icon: Network,
    items: ["API connectors & enrichment", "Tamper-evident audit chain"],
    color: "#a29bfe",
  },
  {
    number: "03",
    label: "AI Engine",
    title: "Compliance & NLP",
    icon: BrainCircuit,
    items: ["ML models + NLP analysis", "Regulatory rule mapping"],
    color: "#00cec9",
  },
  {
    number: "04",
    label: "Risk Analytics",
    title: "Fraud & Risk Scoring",
    icon: BarChart2,
    items: ["Compliance & Fraud indices", "Bypass pathway detection"],
    color: "#fd79a8",
  },
  {
    number: "05",
    label: "Governance",
    title: "Leadership Console",
    icon: LayoutDashboard,
    items: ["CFO · CRO · Board views", "Explainable AI narratives"],
    color: "#fdcb6e",
  },
  {
    number: "06",
    label: "Reporting",
    title: "Regulatory Reporting",
    icon: FileBarChart,
    items: ["RBI · SEBI · IFSCA filings", "Evidence-backed exports"],
    color: "#55efc4",
  },
];

export function Architecture() {
  return (
    <section id="architecture-section" className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-20">
      <div className="mb-12 max-w-3xl">
        <p className="panel-title mb-4">Platform Architecture</p>
        <h2 className="text-4xl leading-tight md:text-6xl">Six-layer intelligence stack</h2>
        <p className="mt-4 text-base text-[color:var(--text-muted)]">
          Raw data → investigation-ready governance intelligence, continuously.
        </p>
      </div>

      <div className="glass-surface rounded-[2.2rem] p-6 md:p-10">
        {/* Top-row: first 3 layers */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {LAYERS.slice(0, 3).map((layer, index) => {
            const Icon = layer.icon;
            return (
              <motion.div
                key={layer.number}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: index * 0.07 }}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="panel-title mb-1">{layer.number}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: layer.color }}>{layer.label}</p>
                    <h3 className="mt-2 text-base font-semibold text-white md:text-lg">{layer.title}</h3>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-2" style={{ color: layer.color }}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {layer.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                      <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>

        {/* Animated down arrows */}
        <div className="my-4 flex justify-center">
          <motion.div
            animate={{ y: [0, 5, 0], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="text-[#a29bfe]"
          >
            <ArrowDown className="h-6 w-6" />
          </motion.div>
        </div>

        {/* Bottom-row: last 3 layers */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {LAYERS.slice(3).map((layer, index) => {
            const Icon = layer.icon;
            return (
              <motion.div
                key={layer.number}
                initial={{ opacity: 0, y: 22 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-60px" }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: index * 0.07 + 0.18 }}
                className="rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-5"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="panel-title mb-1">{layer.number}</p>
                    <p className="text-[10px] font-bold uppercase tracking-[0.2em]" style={{ color: layer.color }}>{layer.label}</p>
                    <h3 className="mt-2 text-base font-semibold text-white md:text-lg">{layer.title}</h3>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-2" style={{ color: layer.color }}>
                    <Icon className="h-4 w-4" />
                  </div>
                </div>
                <ul className="mt-4 space-y-1.5">
                  {layer.items.map((item) => (
                    <li key={item} className="flex items-center gap-2 text-sm text-[color:var(--text-muted)]">
                      <span className="h-1 w-1 shrink-0 rounded-full" style={{ backgroundColor: layer.color }} />
                      {item}
                    </li>
                  ))}
                </ul>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

