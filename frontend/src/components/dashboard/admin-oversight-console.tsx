"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Activity, AlertTriangle, Database, Eye, ShieldCheck, Sparkles } from "lucide-react";
import { EventStream } from "@/components/dashboard/event-stream";
import { CyberGraph } from "@/components/graph/cyber-graph";
import { InvestigationPanel } from "@/components/dashboard/investigation-panel";
import { ManualAuditSnapshot } from "@/components/dashboard/manual-audit-snapshot";
import { SystemStatusPanel } from "@/components/dashboard/system-status-panel";
import { useDashboardStore } from "@/store/dashboard-store";

function formatNumber(value: number | undefined): string {
  return Number(value ?? 0).toLocaleString();
}

export function AdminOversightConsole() {
  const metrics = useDashboardStore((state) => state.metrics);
  const systemState = useDashboardStore((state) => state.systemState);
  const cases = useDashboardStore((state) => state.cases);
  const graph = useDashboardStore((state) => state.graph);

  const adminWatch = useMemo(() => {
    const backendAlerts = systemState?.admin_alerts ?? 0;
    const eventAlerts = (metrics?.recent_events ?? []).filter((event) => {
      const type = event.event_type.toLowerCase();
      return type.includes("admin") || type.includes("alert") || type.includes("sting");
    }).length;
    const total = backendAlerts + eventAlerts;
    return { flagged: total > 0, count: total };
  }, [metrics, systemState]);

  const statValues = [
    formatNumber(systemState?.events_processed),
    formatNumber(systemState?.rules_triggered),
    formatNumber(systemState?.nodes_created),
    formatNumber(cases.length),
  ];
  const escalatedCases = cases.filter((item) => item.status === "escalated").length;

  const STAT_CARDS = [
    { accent: "#6c5ce7", icon: Activity, label: "Events Processed", value: statValues[0] },
    { accent: "#00b894", icon: ShieldCheck, label: "Rules Triggered", value: statValues[1] },
    { accent: "#f39c12", icon: Database, label: "Graph Nodes", value: statValues[2] },
    { accent: "#0984e3", icon: Sparkles, label: "Active Cases", value: statValues[3] },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col gap-5">
      <section className="neo-card px-6 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Admin oversight</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">Executive control room</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              A cleaner summary of platform activity, graph risk context, and investigation readiness for live reviews and prototype pitches.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-[22px] border border-[var(--card-border)] bg-[var(--background)]/80 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Integrity Watch</p>
              <p className="mt-2 inline-flex items-center gap-2 text-sm font-semibold">
                <span className={`h-2 w-2 rounded-full ${adminWatch.flagged ? "bg-[var(--danger)] pulse-dot" : "bg-[#00b894]"}`} />
                {adminWatch.flagged ? "Flagged" : "Stable"}
              </p>
            </div>
            <div className="rounded-[22px] border border-[var(--card-border)] bg-[var(--background)]/80 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Admin Alerts</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{adminWatch.count}</p>
            </div>
            <div className="rounded-[22px] border border-[var(--card-border)] bg-[var(--background)]/80 px-4 py-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Escalated Cases</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{escalatedCases}</p>
            </div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {STAT_CARDS.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.article
                key={card.label}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.06 }}
                className="relative overflow-hidden rounded-[24px] border border-[var(--card-border)] bg-[var(--card-bg)] px-5 py-4 shadow-sm"
              >
                <div className="absolute left-0 top-0 h-full w-1 rounded-l-[24px]" style={{ backgroundColor: card.accent }} />
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{card.label}</p>
                    <p className="mt-2 text-3xl font-semibold tracking-tight" style={{ color: card.accent }}>{card.value}</p>
                  </div>
                  <div className="rounded-2xl p-2.5" style={{ backgroundColor: `${card.accent}15` }}>
                    <Icon className="h-5 w-5" style={{ color: card.accent }} />
                  </div>
                </div>
              </motion.article>
            );
          })}
        </div>
      </section>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.45fr)_360px]">
        <section className="neo-card overflow-hidden p-0">
          <div className="border-b border-[var(--card-border)] px-5 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Relationship workspace</p>
            <h3 className="mt-1 text-lg font-semibold tracking-tight text-[var(--foreground)]">Calmer 3D graph view</h3>
            <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
              The network is simplified for executive review, with clearer risk context and less visual noise than the older admin graph.
            </p>
          </div>
          <div className="h-[520px] md:h-[600px]">
            <CyberGraph
              graphData={graph}
              matchedCases={cases}
            />
          </div>
        </section>

        <div className="flex min-h-0 flex-col gap-5">
          <section className="neo-card px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="panel-title">Integrity Watch</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {adminWatch.flagged
                    ? "Privileged activity needs review before the next decision cycle."
                    : "Oversight channels are clear and operating within expected guardrails."}
                </p>
              </div>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold ${
                adminWatch.flagged ? "bg-[var(--danger)]/10 text-[var(--danger)]" : "bg-[#00b894]/10 text-[#00b894]"
              }`}>
                {adminWatch.flagged ? <AlertTriangle className="h-3.5 w-3.5" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                {adminWatch.flagged ? "Review required" : "Clear"}
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-[var(--background)] px-3 py-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Attention items</p>
                <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{adminWatch.count}</p>
              </div>
              <div className="rounded-2xl bg-[var(--background)] px-3 py-3">
                <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Executive layer</p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]">
                  <Eye className="h-3.5 w-3.5 text-[var(--primary)]" />
                  Active
                </p>
              </div>
            </div>
          </section>

          <ManualAuditSnapshot
            title="Manual Audit Escalations"
            description="Auditor-submitted manual audits sit in the admin oversight rail so escalations and policy-sensitive findings are visible beside system health and investigations."
            maxItems={3}
          />

          <SystemStatusPanel />

          <div className="flex min-h-[320px] flex-1 flex-col">
            <InvestigationPanel />
          </div>
        </div>
      </div>

      <div className="min-h-[260px]">
        <EventStream />
      </div>
    </div>
  );
}
