"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, BarChart3, FileText, GitBranch, LayoutGrid, Settings, ShieldCheck, Workflow } from "lucide-react";
import { AdminOversightConsole } from "@/components/dashboard/admin-oversight-console";
import { RegulationIntelligencePanel } from "@/components/dashboard/regulation-intelligence-panel";
import { AuditorPipelineConsole } from "@/components/dashboard/auditor-pipeline-console";
import { PolicyComplianceUpdater } from "@/components/dashboard/policy-compliance-updater";
import { AuditorReportWriter } from "@/components/dashboard/auditor-report-writer";
import { EventStream } from "@/components/dashboard/event-stream";
import { CyberGraph } from "@/components/graph/cyber-graph";
import { InvestigationPanel } from "@/components/dashboard/investigation-panel";
import { ManualAuditPanel } from "@/components/dashboard/manual-audit-panel";
import { MultiAgentCharts } from "@/components/dashboard/multi-agent-charts";
import { PolicyReferenceViewer } from "@/components/dashboard/policy-reference-viewer";
import { SystemStatusPanel } from "@/components/dashboard/system-status-panel";
import { VendorGraphWorkspace } from "@/components/dashboard/vendor-graph-workspace";
import { useHasMounted } from "@/hooks/use-has-mounted";
import { useDashboardStore } from "@/store/dashboard-store";

function average(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[m - 1] + sorted[m]) / 2 : sorted[m];
}

function pct(v: number): string { return `${v.toFixed(1)}%`; }
function money(v: number): string { return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number.isFinite(v) ? v : 0); }

function titleCaseLabel(value: string | null | undefined): string {
  if (!value) return "Unclassified pathway";
  return value
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1).toLowerCase())
    .join(" ");
}

/* ─── Segmented Tab Control ─── */
function SegmentedTabs<T extends string>({ tabs, active, onChange }: { tabs: Array<{ id: T; label: string; icon: typeof LayoutGrid }>; active: T; onChange: (id: T) => void }) {
  return (
    <div className="inline-flex items-center rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] p-1 shadow-sm">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = active === tab.id;
        return (
          <button key={tab.id} onClick={() => onChange(tab.id)}
            className={`relative inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold transition-all duration-300 ${isActive ? "text-white" : "text-[var(--text-muted)] hover:text-[var(--foreground)]"}`}>
            {isActive && (
              <motion.div layoutId="activeTab"
                className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] shadow-md shadow-[#6c5ce7]/20"
                transition={{ type: "spring", bounce: 0.15, duration: 0.5 }} />
            )}
            <span className="relative z-10 inline-flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5" />{tab.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SectionTransition({ children, id }: { children: React.ReactNode; id: string }) {
  return (
    <AnimatePresence mode="wait">
      <motion.div key={id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.3 }} className="flex min-h-0 flex-1 flex-col">
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

const riskColors: Record<string, string> = { LOW: "#00b894", MEDIUM: "#f39c12", HIGH: "#e17055", CRITICAL: "#e74c3c" };
const riskPriority: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

function WorkspaceMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[22px] border border-[var(--card-border)]/70 bg-[var(--background)]/80 px-4 py-3 shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-lg font-semibold tracking-tight text-[var(--foreground)]">{value}</p>
    </div>
  );
}

export default function DashboardPage() {
  const router = useRouter();
  const mounted = useHasMounted();
  const status = useDashboardStore((state) => state.status);
  const errorMessage = useDashboardStore((state) => state.errorMessage);
  const graph = useDashboardStore((state) => state.graph);
  const role = useDashboardStore((state) => state.role);
  const userName = useDashboardStore((state) => state.userName);
  const initialize = useDashboardStore((state) => state.initialize);
  const refreshPipeline = useDashboardStore((state) => state.refreshPipeline);
  const openInvestigation = useDashboardStore((state) => state.openInvestigation);
  const logout = useDashboardStore((state) => state.logout);
  const cases = useDashboardStore((state) => state.cases);
  const systemState = useDashboardStore((state) => state.systemState);
  const metrics = useDashboardStore((state) => state.metrics);

  const activeAdminSection = useDashboardStore((state) => state.activeAdminSection);
  const activeAuditorSection = useDashboardStore((state) => state.activeAuditorSection);
  const setActiveAdminSection = useDashboardStore((state) => state.setActiveAdminSection);
  const setActiveAuditorSection = useDashboardStore((state) => state.setActiveAuditorSection);

  useEffect(() => { if (status === "idle") void initialize(); }, [status, initialize]);
  useEffect(() => { if (status === "unauthenticated") router.replace("/login"); }, [status, router]);
  useEffect(() => {
    if (status !== "ready") return;
    const interval = window.setInterval(() => { void refreshPipeline(); }, 60000);
    return () => window.clearInterval(interval);
  }, [status, refreshPipeline]);

  const riskDistribution = useMemo(() => {
    const base = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
    for (const item of cases) base[item.risk_level] += 1;
    return base;
  }, [cases]);

  const analytics = useMemo(() => {
    const conf = cases.map((i) => Number(i.confidence) || 0);
    const trust = cases.map((i) => Number(i.trust_score) || 0);
    const paths = cases.map((i) => i.path_nodes.length);
    const amts = cases.map((i) => Number(i.transaction_amount) || 0);
    const esc = cases.filter((i) => i.status === "escalated").length;
    const fp = cases.filter((i) => i.status === "false_positive").length;
    const ruleCounts = new Map<string, number>();
    for (const item of cases) for (const rule of item.rules_triggered) ruleCounts.set(rule, (ruleCounts.get(rule) ?? 0) + 1);
    const topRules = [...ruleCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
    const highExp = [...cases].sort((a, b) => (Number(b.transaction_amount) || 0) - (Number(a.transaction_amount) || 0)).slice(0, 8);
    return {
      avgConf: average(conf), medConf: median(conf), avgTrust: average(trust),
      avgPath: average(paths), maxPath: paths.length ? Math.max(...paths) : 0,
      totalExp: amts.reduce((s, v) => s + v, 0), avgExp: average(amts),
      escRate: cases.length ? (esc / cases.length) * 100 : 0,
      fpRate: cases.length ? (fp / cases.length) * 100 : 0,
      topRules, highExp,
    };
  }, [cases]);

  const primaryCase = useMemo(() => {
    if (!cases.length) return null;
    return [...cases].sort((a, b) => {
      const riskDiff = (riskPriority[b.risk_level] ?? 0) - (riskPriority[a.risk_level] ?? 0);
      if (riskDiff !== 0) return riskDiff;

      const exposureDiff = (Number(b.transaction_amount) || 0) - (Number(a.transaction_amount) || 0);
      if (exposureDiff !== 0) return exposureDiff;

      return (Number(b.confidence) || 0) - (Number(a.confidence) || 0);
    })[0];
  }, [cases]);

  const pathwaySummaryMetrics = primaryCase
    ? [
        { label: "Linked actors", value: String(primaryCase.actors_involved.length) },
        { label: "Path steps", value: String(primaryCase.path_nodes.length) },
        { label: "Controls hit", value: String(primaryCase.rules_triggered.length) },
        { label: "Potential exposure", value: money(primaryCase.transaction_amount) },
      ]
    : [
        { label: "Linked actors", value: "0" },
        { label: "Path steps", value: "0" },
        { label: "Controls hit", value: "0" },
        { label: "Potential exposure", value: money(0) },
      ];



  const workspaceSummary = role === "admin"
    ? "Monitor the system at a glance, then drill into graph activity, investigations, policy sync, and telemetry without overcrowding the screen."
    : "Move through the audit flow one step at a time: inspect the pipeline, investigate a focused graph, draft a report, and keep policy rules current in a clean workspace.";

  if (!mounted) {
    return (
      <div className="flex min-h-full flex-1 flex-col gap-5 pb-6">
        <section className="neo-card px-5 py-5">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <div className="h-3 w-32 rounded-full bg-[var(--card-border)]" />
              <div className="mt-3 h-8 w-64 rounded-full bg-[var(--card-border)]" />
              <div className="mt-3 h-4 w-full max-w-2xl rounded-full bg-[var(--card-border)]" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-[78px] w-[150px] rounded-[22px] border border-[var(--card-border)]/70 bg-[var(--background)]/80 px-4 py-3 shadow-sm" />
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[minmax(0,1.18fr)_380px]">
          <div className="neo-card h-[220px] rounded-[28px]" />
          <div className="grid gap-5">
            <div className="neo-card h-[102px] rounded-[28px]" />
            <div className="neo-card h-[102px] rounded-[28px]" />
          </div>
        </section>

        <div className="h-12 w-full max-w-[620px] rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)]" />
        <section className="neo-card min-h-[620px] p-5">
          <div className="h-full min-h-[560px] rounded-[24px] border border-[var(--card-border)] bg-[var(--background)]/70" />
        </section>
      </div>
    );
  }

  if (status === "unauthenticated") {
    return <div className="flex min-h-[60vh] items-center justify-center"><div className="neo-card px-6 py-4 text-sm text-[var(--text-muted)]">Redirecting to secure login...</div></div>;
  }

  if (status === "loading" && !graph) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
        <div className="neo-card flex items-center gap-3 px-6 py-4 text-sm text-[var(--text-muted)]">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--primary)] border-t-transparent" />
          Bootstrapping secure backend...
        </div>
        <button 
          onClick={() => void initialize()} 
          className="text-xs font-semibold text-[var(--text-muted)] hover:text-[var(--foreground)] underline decoration-dotted underline-offset-4 transition-opacity hover:opacity-100"
        >
          Taking too long? Click here to force retry
        </button>
      </div>
    );
  }

  if (status === "error" && !graph) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="neo-card max-w-xl px-6 py-5 text-sm">
          <p className="text-[var(--danger)] font-semibold">Connection failed: {errorMessage}</p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => { void initialize(); }} className="rounded-2xl bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] px-5 py-2 text-xs font-bold text-white shadow-md">Retry</button>
            <button onClick={() => { logout(); router.push("/login"); }} className="pro-button text-[var(--danger)]">Logout</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full flex-1 flex-col gap-5 pb-6">
      <section className="neo-card px-5 py-5">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-[var(--primary)]">
              {role === "admin" ? "Admin control room" : "Auditor workspace"}
            </p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--foreground)]">
              Welcome back{userName ? `, ${userName}` : ""}.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-muted)]">{workspaceSummary}</p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <WorkspaceMetric label="Open Cases" value={String(cases.length)} />
            <WorkspaceMetric label="Risk Level" value={systemState?.risk_level ?? "LOW"} />
            <WorkspaceMetric label="Policy Rules" value={String(systemState?.policy_rules_in_scope ?? 0)} />
            <WorkspaceMetric label="Graph Nodes" value={String(graph?.nodes.length ?? 0)} />
            <WorkspaceMetric label="Exposure" value={money(analytics.totalExp)} />
          </div>
        </div>
      </section>

      <section className="grid gap-5">
        <motion.article
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="neo-card overflow-hidden px-5 py-5"
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-2 rounded-full bg-[var(--primary)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">
                <GitBranch className="h-3.5 w-3.5" />
                Detected pathway summary
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">
                  {primaryCase ? titleCaseLabel(primaryCase.pathway_type) : "Awaiting live pathway detection"}
                </h2>
                <span
                  className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[10px] font-bold"
                  style={{
                    backgroundColor: `${riskColors[primaryCase?.risk_level ?? systemState?.risk_level ?? "LOW"]}18`,
                    color: riskColors[primaryCase?.risk_level ?? systemState?.risk_level ?? "LOW"],
                  }}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {primaryCase?.risk_level ?? systemState?.risk_level ?? "LOW"} risk
                </span>
              </div>
              <p className="mt-3 max-w-2xl text-sm leading-7 text-[var(--text-muted)]">
                {primaryCase
                  ? `Case ${primaryCase.case_id} links ${primaryCase.actors_involved.length} actors across ${primaryCase.path_nodes.length} steps, helping ${role === "admin" ? "leadership and control owners" : "auditors"} understand how the risk pathway formed instead of chasing isolated alerts.`
                  : "As cases are detected, this card will spotlight the clearest risk pathway so the demo shows not only what fired, but how the control bypass emerged."}
              </p>
            </div>

          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {pathwaySummaryMetrics.map((item) => (
              <div key={item.label} className="rounded-[22px] border border-[var(--card-border)]/70 bg-[var(--background)]/80 px-4 py-3 shadow-sm">
                <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{item.label}</p>
                <p className="mt-1.5 text-lg font-semibold tracking-tight text-[var(--foreground)]">{item.value}</p>
              </div>
            ))}
          </div>

        </motion.article>

      </section>

      {role === "admin" ? (
        <>
          <SegmentedTabs tabs={[
            { id: "overview" as const, label: "Overview", icon: LayoutGrid },
            { id: "graph" as const, label: "Graph Workspace", icon: Workflow },
            { id: "investigation" as const, label: "Investigation", icon: ShieldCheck },
            { id: "policy" as const, label: "Policy & Law Sync", icon: FileText },
            { id: "regintel" as const, label: "Reg Intelligence", icon: AlertTriangle },
            { id: "telemetry" as const, label: "Telemetry", icon: BarChart3 },
          ]} active={activeAdminSection} onChange={setActiveAdminSection} />

          <SectionTransition id={activeAdminSection}>
            {activeAdminSection === "overview" && <section className="min-h-0"><AdminOversightConsole /></section>}
            {activeAdminSection === "graph" && (
              <section className="overflow-hidden rounded-[28px] border border-[var(--card-border)]/70 bg-[var(--card-bg)]">
                <div className="border-b border-[var(--card-border)] px-5 py-4">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Enterprise graph workspace</p>
                  <h3 className="mt-1 text-lg font-semibold tracking-tight text-[var(--foreground)]">Calmer relationship map</h3>
                  <p className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
                    A furnished 3D network view designed to feel cleaner in a live pitch while keeping investigation context one click away.
                  </p>
                </div>
                <div className="h-[620px] min-h-[560px]">
                  <CyberGraph
                    graphData={graph}
                    matchedCases={cases}
                    onOpenInvestigation={openInvestigation}
                  />
                </div>
              </section>
            )}
            {activeAdminSection === "investigation" && (
              <div
                className="grid min-h-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(340px,0.95fr)_minmax(0,1.45fr)]"
                style={{ minHeight: "560px", height: "min(760px, calc(100vh - 220px))" }}
              >
                <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl">
                  <EventStream />
                </div>
                <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl">
                  <InvestigationPanel />
                </div>
              </div>
            )}
            {activeAdminSection === "policy" && <section className="min-h-[620px]"><PolicyComplianceUpdater /></section>}
            {activeAdminSection === "regintel" && (
              <section className="min-h-[620px]">
                <RegulationIntelligencePanel />
              </section>
            )}
            {activeAdminSection === "telemetry" && (
              <div className="custom-scrollbar overflow-y-auto pb-6">
                <div className="grid grid-cols-1 gap-6 2xl:grid-cols-[1fr_380px]">
                  {/* Left: Multi-Agent Realtime Charts */}
                  <div>
                    <MultiAgentCharts />
                  </div>

                  {/* Right: System Status + Compliance snapshot */}
                  <div className="space-y-5">
                    <SystemStatusPanel />

                    <section className="neo-card p-5">
                      <p className="panel-title mb-4">Precision Snapshot</p>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Avg Confidence", value: pct(analytics.avgConf) },
                          { label: "Median Conf", value: pct(analytics.medConf) },
                          { label: "Escalation Rate", value: pct(analytics.escRate) },
                          { label: "Event / min", value: String(metrics?.recent_events?.length ? (metrics.recent_events.length / 15).toFixed(2) : "0") },
                        ].map((m) => (
                          <div key={m.label} className="rounded-2xl bg-[var(--background)] px-4 py-3">
                            <p className="text-[9px] font-bold tracking-widest text-[var(--text-muted)] uppercase">{m.label}</p>
                            <p className="mt-1.5 text-lg font-bold">{m.value}</p>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="neo-card p-5">
                      <p className="panel-title mb-4">Risk Distribution</p>
                      <div className="space-y-3">
                        {(Object.entries(riskDistribution) as [keyof typeof riskColors, number][]).map(([level, count]) => (
                          <div key={level}>
                            <div className="mb-1 flex items-center justify-between text-sm">
                              <span className="font-medium">{level}</span>
                              <span className="font-bold">{count}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-[var(--background)]">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${cases.length ? (count / cases.length) * 100 : 0}%` }}
                                transition={{ duration: 0.8 }}
                                className="h-full rounded-full"
                                style={{ background: riskColors[level] }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="neo-card p-5">
                      <p className="panel-title mb-4">Top Rules</p>
                      <div className="space-y-2.5">
                        {analytics.topRules.length ? analytics.topRules.map(([rule, count]) => (
                          <div key={rule} className="flex items-center justify-between gap-2 text-sm">
                            <span className="truncate text-[var(--text-muted)]">{rule}</span>
                            <span className="shrink-0 rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--primary)]">{count}</span>
                          </div>
                        )) : <p className="text-xs text-[var(--text-muted)]">No rule evidence.</p>}
                      </div>
                    </section>
                  </div>
                </div>
              </div>
            )}
          </SectionTransition>
        </>
      ) : (
        <>
          <SegmentedTabs tabs={[
            { id: "pipeline" as const, label: "Pipeline Explorer", icon: Workflow },
            { id: "investigation" as const, label: "Investigation", icon: ShieldCheck },
            { id: "report" as const, label: "Report Writer", icon: BarChart3 },
            { id: "policy" as const, label: "Policy Reference", icon: FileText },
            { id: "settings" as const, label: "Manual Audit", icon: Settings },
          ]} active={activeAuditorSection} onChange={setActiveAuditorSection} />

          <SectionTransition id={activeAuditorSection}>
            {activeAuditorSection === "pipeline" && <section className="min-h-[680px]"><AuditorPipelineConsole /></section>}
            {activeAuditorSection === "investigation" && (
              <div
                className="grid min-h-0 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.62fr)_minmax(340px,0.82fr)]"
                style={{ minHeight: "720px", height: "min(960px, calc(100vh - 180px))" }}
              >
                <section className="neo-card flex min-h-0 overflow-hidden">
                  <VendorGraphWorkspace />
                </section>
                <div className="flex min-h-0 flex-col overflow-hidden">
                  <InvestigationPanel />
                </div>
              </div>
            )}

            {activeAuditorSection === "report" && <section className="min-h-[620px]"><AuditorReportWriter /></section>}
            {activeAuditorSection === "policy" && <section className="min-h-[620px]"><PolicyReferenceViewer /></section>}
            {activeAuditorSection === "settings" && (
              <div className="custom-scrollbar h-full overflow-y-auto">
                <ManualAuditPanel />
              </div>
            )}
          </SectionTransition>
        </>
      )}
    </div>
  );
}
