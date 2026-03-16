"use client";

import { motion } from "framer-motion";
import { BrainCircuit, GitFork, ShieldCheck } from "lucide-react";

const ENGINES = [
  {
    title: "Decision Twin Engine",
    description:
      "Reconstructs enterprise entity behavior as a living decision graph with full traceability.",
    icon: BrainCircuit,
  },
  {
    title: "Governance Rule Engine",
    description:
      "Executes deterministic control logic with policy lineage and auditable decision checkpoints.",
    icon: ShieldCheck,
  },
  {
    title: "Graph Intelligence Engine",
    description:
      "Detects hidden multi-hop transaction pathways and exposes bypass structures before escalation.",
    icon: GitFork,
  },
];

export function SystemTransparency() {
  return (
    <section id="platform-engines" className="mx-auto max-w-[1440px] px-6 py-16 md:px-10 md:py-20">
      <div className="mb-16 max-w-3xl">
        <p className="panel-title mb-4">Platform Engines</p>
        <h2 className="text-4xl leading-tight md:text-6xl">Three enterprise engines powering governance certainty</h2>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {ENGINES.map((engine, index) => {
          const Icon = engine.icon;
          return (
            <motion.article
              key={engine.title}
              initial={{ opacity: 0, y: 28 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-80px" }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1], delay: index * 0.08 }}
              whileHover={{ y: -6, scale: 1.01, transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] } }}
              className="glass-surface rounded-[2rem] p-8"
            >
              <div className="mb-7 inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-primary/40 bg-primary/15 text-primary">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-2xl leading-tight">{engine.title}</h3>
              <p className="mt-4 text-base leading-relaxed text-[color:var(--text-muted)]">{engine.description}</p>
            </motion.article>
          );
        })}
      </div>
    </section>
  );
}

