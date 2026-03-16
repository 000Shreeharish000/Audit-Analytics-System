"use client";

import { motion } from "framer-motion";
import { Activity, Database, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";

function formatValue(value: number | undefined): string {
  return Number(value ?? 0).toLocaleString();
}

function MiniRing({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const circumference = 2 * Math.PI * 18;
  const dashOffset = circumference * (1 - pct);

  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="shrink-0">
      <circle cx="24" cy="24" r="18" fill="none" stroke="var(--background)" strokeWidth="3" />
      <motion.circle
        cx="24" cy="24" r="18" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: dashOffset }}
        transition={{ duration: 1.2 }}
        transform="rotate(-90 24 24)"
      />
    </svg>
  );
}

export function SystemStatusPanel() {
  const runtimeMode = useDashboardStore((state) => state.runtimeMode);
  const systemState = useDashboardStore((state) => state.systemState);
  const refreshPipeline = useDashboardStore((state) => state.refreshPipeline);
  const status = useDashboardStore((state) => state.status);

  const isHealthy = (systemState?.components?.secure_ai_inference ?? "").toLowerCase().includes("active") || runtimeMode === "air-gapped";
  const eventsProcessed = systemState?.events_processed ?? 0;
  const ruleHits = systemState?.rules_triggered ?? 0;
  const policyRulesInScope = systemState?.policy_rules_in_scope ?? 0;

  return (
    <section className="neo-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <p className="panel-title">Telemetry</p>
          <p className="mt-1 text-xs text-[var(--text-muted)]">Runtime diagnostics</p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--primary)]/10 px-3 py-1 text-[10px] font-bold text-[var(--primary)]">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
          {runtimeMode === "hybrid" ? "Hybrid" : "Air-Gapped"}
        </span>
      </div>

      {/* Ring indicators */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { v: eventsProcessed, mx: Math.max(eventsProcessed, 100), color: "#6c5ce7", label: "Events", display: eventsProcessed > 999 ? `${(eventsProcessed / 1000).toFixed(1)}k` : eventsProcessed },
          { v: ruleHits, mx: Math.max(ruleHits, 20), color: "#00b894", label: "Rule Hits", display: ruleHits },
          { v: policyRulesInScope, mx: Math.max(policyRulesInScope, 12), color: "#38bdf8", label: "Policy Rules", display: policyRulesInScope },
          { v: systemState?.nodes_created ?? 0, mx: Math.max(systemState?.nodes_created ?? 0, 100), color: "#f39c12", label: "Graph", display: (systemState?.nodes_created ?? 0) > 999 ? `${((systemState?.nodes_created ?? 0) / 1000).toFixed(1)}k` : systemState?.nodes_created ?? 0 },
        ].map((r) => (
          <div key={r.label} className="flex flex-col items-center gap-1 rounded-2xl bg-[var(--background)]/55 px-2 py-2">
            <div className="relative">
              <MiniRing value={r.v} max={r.mx} color={r.color} />
              <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold">{r.display}</span>
            </div>
            <span className="text-[9px] font-bold text-[var(--text-muted)]">{r.label}</span>
          </div>
        ))}
      </div>

      {/* Health */}
      <div className={`mb-4 flex items-center gap-2 rounded-2xl px-3 py-2.5 text-xs font-semibold ${
        isHealthy ? "bg-[#00b894]/10 text-[#00b894]" : "bg-[var(--danger)]/10 text-[var(--danger)]"
      }`}>
        <span className={`h-2 w-2 rounded-full ${isHealthy ? "bg-[#00b894]" : "bg-[var(--danger)]"} pulse-dot`} />
        {isHealthy ? "All Systems Healthy" : "Degraded Performance"}
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-2 gap-2 text-[11px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1.5"><Activity className="h-3 w-3 text-[var(--primary)]" /> Cases {formatValue(systemState?.cases_detected)}</span>
        <span className="inline-flex items-center gap-1.5"><Database className="h-3 w-3 text-[#f39c12]" /> Density {systemState?.graph_density ?? 0}</span>
        <span className="inline-flex items-center gap-1.5"><Sparkles className="h-3 w-3 text-[#00b894]" /> Chain {systemState?.audit_chain_valid ? "valid" : "check"}</span>
        <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-3 w-3 text-[#e74c3c]" /> Alerts {formatValue(systemState?.admin_alerts ?? 0)}</span>
      </div>

      <button
        onClick={() => { void refreshPipeline(); }}
        disabled={status === "loading"}
        className="mt-4 w-full rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] px-4 py-2.5 text-xs font-bold text-white shadow-md shadow-[#6c5ce7]/15 transition-all hover:shadow-lg hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
      >
        <RefreshCw className={`mr-2 inline h-3.5 w-3.5 ${status === "loading" ? "animate-spin" : ""}`} />
        Sync Telemetry
      </button>
    </section>
  );
}
