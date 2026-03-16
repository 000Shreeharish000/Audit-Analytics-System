"use client";

import { motion } from "framer-motion";
import { BrainCircuit, GitBranch, Lock, SearchCheck, ShieldAlert } from "lucide-react";

const FEATURES = [
  {
    title: "Decision Twin Engine",
    description: "Live digital replica of enterprise decisions with full traceability.",
    icon: BrainCircuit,
    color: "#6c5ce7",
  },
  {
    title: "Governance Rule Engine",
    description: "Deterministic policy controls with auditable, explainable outcomes.",
    icon: ShieldAlert,
    color: "#fd79a8",
  },
  {
    title: "Pathway Detection",
    description: "Exposes multi-hop control bypasses across transaction chains.",
    icon: GitBranch,
    color: "#00cec9",
  },
  {
    title: "Explainable AI",
    description: "Evidence-rich case narratives for auditors and leadership.",
    icon: SearchCheck,
    color: "#fdcb6e",
  },
  {
    title: "Air-Gapped Inference",
    description: "Isolated reasoning mode for air-gapped enterprise environments.",
    icon: Lock,
    color: "#55efc4",
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-[1440px] px-6 py-28 md:px-10">
      <div className="mb-12 max-w-3xl">
        <p className="panel-title mb-4">Platform Features</p>
        <h2 className="text-3xl md:text-5xl">Built for audit-critical operations</h2>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-5">
        {FEATURES.map((feature, index) => {
          const Icon = feature.icon;
          return (
            <motion.article
              key={feature.title}
              initial={{ opacity: 0, y: 35 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.5, delay: index * 0.06 }}
              whileHover={{ y: -6, transition: { duration: 0.3 } }}
              className="glass-surface overflow-hidden rounded-3xl"
            >
              {/* Colored accent bar */}
              <div className="h-1 w-full" style={{ background: `linear-gradient(90deg, ${feature.color}cc, ${feature.color}44)` }} />
              <div className="p-5">
                <div className="mb-4 inline-flex rounded-2xl border p-2.5" style={{ borderColor: `${feature.color}55`, backgroundColor: `${feature.color}18`, color: feature.color }}>
                  <Icon className="h-4 w-4" />
                </div>
                <h3 className="text-base font-semibold leading-tight">{feature.title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-[color:var(--text-muted)]">{feature.description}</p>
              </div>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}

