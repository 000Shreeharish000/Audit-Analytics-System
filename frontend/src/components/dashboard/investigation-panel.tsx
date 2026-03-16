"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Bot, ClipboardList, FileSearch, ShieldCheck, Sparkles } from "lucide-react";
import { fetchManualAudits } from "@/lib/api";
import type { ManualAuditRecord } from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";

function toPointList(text: string): string[] {
  return text.split(/;|\.(?=\s+[A-Z])/g).map((c) => c.trim()).filter(Boolean).slice(0, 12);
}

function formatAuditDate(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatAgentLabel(value: string): string {
  return value
    .split(/[_-]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function formatPercent(value: number): string {
  const normalized = value <= 1 ? value * 100 : value;
  return `${normalized.toFixed(normalized >= 10 ? 0 : 1)}%`;
}

export function InvestigationPanel() {
  const cases = useDashboardStore((state) => state.cases);
  const activeCaseId = useDashboardStore((state) => state.activeCaseId);
  const investigation = useDashboardStore((state) => state.investigation);
  const investigationLoading = useDashboardStore((state) => state.investigationLoading);
  const investigationError = useDashboardStore((state) => state.investigationError);
  const openInvestigation = useDashboardStore((state) => state.openInvestigation);
  const token = useDashboardStore((state) => state.token);

  const [expandedCaseId, setExpandedCaseId] = useState<string | null>(null);
  const [manualAudits, setManualAudits] = useState<ManualAuditRecord[]>([]);
  const [manualAuditError, setManualAuditError] = useState<string | null>(null);
  const [manualAuditsLoaded, setManualAuditsLoaded] = useState(false);

  useEffect(() => {
    if (!token) {
      return;
    }

    let cancelled = false;
    fetchManualAudits(token)
      .then((response) => {
        if (!cancelled) {
          setManualAudits(response);
          setManualAuditError(null);
          setManualAuditsLoaded(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setManualAuditError(error instanceof Error ? error.message : "Unable to load linked manual audits.");
          setManualAuditsLoaded(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const activeCase = cases.find((i) => i.case_id === activeCaseId) ?? cases[0] ?? null;
  const expandedExplanation = activeCase ? expandedCaseId === activeCase.case_id : false;
  const explanationPoints = useMemo(() => toPointList(investigation?.risk_explanation ?? ""), [investigation?.risk_explanation]);
  const visiblePoints = expandedExplanation ? explanationPoints : explanationPoints.slice(0, 5);
  const agentAnalysis = investigation?.agent_analysis ?? null;
  const investigationRecommendations = agentAnalysis?.consensus.final_recommendations.length
    ? agentAnalysis.consensus.final_recommendations
    : investigation?.recommended_audit_actions ?? [];
  const linkedManualAudits = useMemo(() => {
    if (!activeCase) {
      return [];
    }

    return manualAudits
      .filter((record) => record.case_ids.includes(activeCase.case_id))
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [activeCase, manualAudits]);
  const manualAuditsLoading = Boolean(token) && !manualAuditsLoaded && manualAuditError === null;

  const confidenceValue = Math.round(activeCase?.confidence ?? 0);
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference * (1 - Math.min(Math.max(confidenceValue, 0), 100) / 100);

  const riskColors: Record<string, string> = { LOW: "#00b894", MEDIUM: "#f39c12", HIGH: "#e17055", CRITICAL: "#e74c3c" };
  const riskColor = activeCase ? riskColors[activeCase.risk_level] ?? "#6c5ce7" : "#6c5ce7";

  return (
    <section className="neo-card flex min-h-0 flex-1 flex-col overflow-hidden" style={{ minHeight: "400px" }}>
      <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-3.5">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-[var(--primary)]/10 p-1.5">
            <FileSearch className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <p className="text-sm font-bold">Investigation</p>
        </div>
      </div>

      {!activeCase ? (
        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-[var(--text-muted)]">
          <div className="rounded-2xl bg-[var(--background)] p-6">
            <FileSearch className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]/40" />
            No visible pathway case is currently selected. Linked manual audits appear here once a visible case is opened.
          </div>
        </div>
      ) : (
        <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <p className="panel-title">Case</p>
              <p className="mt-0.5 font-mono text-xs font-bold">{activeCase.case_id}</p>
            </div>
            <button onClick={() => { void openInvestigation(activeCase.case_id); }} className="pro-button text-[10px]">Refresh</button>
          </div>

          {cases.length > 1 ? (
            <div className="mb-5 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Visible cases</p>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">Switch the active investigation so the panel does not feel locked to a single case.</p>
                </div>
                <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">{cases.length} available</span>
              </div>
              <div className="custom-scrollbar mt-3 flex gap-2 overflow-x-auto pb-1">
                {cases.map((caseItem) => {
                  const isActive = caseItem.case_id === activeCase.case_id;
                  return (
                    <button
                      key={caseItem.case_id}
                      type="button"
                      onClick={() => { void openInvestigation(caseItem.case_id); }}
                      className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[10px] font-semibold transition-all ${
                        isActive
                          ? "border-[var(--primary)] bg-[var(--primary)] text-white shadow-sm"
                          : "border-[var(--card-border)] bg-[var(--card-bg)] text-[var(--text-muted)] hover:text-[var(--foreground)]"
                      }`}
                    >
                      {caseItem.case_id} · {caseItem.risk_level}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          {/* Confidence Ring */}
          <div className="mb-5 flex items-center gap-5 rounded-2xl bg-[var(--background)] px-5 py-4">
            <div className="relative shrink-0">
              <svg width="84" height="84" viewBox="0 0 84 84">
                <circle cx="42" cy="42" r="36" fill="none" stroke="var(--card-border)" strokeWidth="4" />
                <motion.circle cx="42" cy="42" r="36" fill="none" stroke={riskColor} strokeWidth="4" strokeLinecap="round"
                  strokeDasharray={circumference}
                  initial={{ strokeDashoffset: circumference }}
                  animate={{ strokeDashoffset: dashOffset }}
                  transition={{ duration: 1.4 }}
                  transform="rotate(-90 42 42)"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-xl font-bold" style={{ color: riskColor }}>
                {confidenceValue}%
              </span>
            </div>
            <div>
              <p className="text-sm font-bold">Confidence</p>
              <p className="mt-1 inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${riskColor}15`, color: riskColor }}>
                {activeCase.risk_level} RISK
              </p>
            </div>
          </div>

          {/* Risk Explanation */}
          <div className="mb-4 rounded-2xl border border-red-200/50 bg-red-50 px-4 py-3.5 dark:border-red-500/15 dark:bg-red-500/10">
            <p className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-bold tracking-widest text-[var(--danger)]">
              <AlertTriangle className="h-3 w-3" />
              RISK EXPLANATION
            </p>
            {investigationLoading ? (
              <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
                Analyzing...
              </div>
            ) : investigationError ? (
              <p className="text-xs text-[var(--danger)]">{investigationError}</p>
            ) : (
              <div className="space-y-2.5">
                {visiblePoints.length ? (
                  <ul className="space-y-1.5 text-xs leading-relaxed">
                    {visiblePoints.map((point, i) => (
                      <li key={`${i}-${point}`} className="flex gap-2">
                        <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--danger)]" />
                        <span className="text-[var(--foreground)]">{point}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-[var(--foreground)]">{investigation?.risk_explanation ?? "Report pending."}</p>
                )}
                {explanationPoints.length > 5 && (
                  <button onClick={() => setExpandedCaseId((p) => p === activeCase.case_id ? null : activeCase.case_id)} className="pro-button text-[10px] text-[var(--danger)]">
                    {expandedExplanation ? "Show Less" : "Show More"}
                  </button>
                )}
              </div>
            )}
          </div>

          <div className="mb-4 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
                  <Bot className="h-3.5 w-3.5" />
                  Multi-agent review
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Local and external agent opinions are merged into one audit-facing consensus without replacing the existing investigation narrative.
                </p>
              </div>
              <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">
                {agentAnalysis ? agentAnalysis.mode === "hybrid" ? "Hybrid AI" : "Air-gapped AI" : "Pending"}
              </span>
            </div>

            {investigationLoading ? (
              <div className="mt-3 flex items-center gap-2 text-xs text-[var(--text-muted)]">
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[var(--text-muted)] border-t-transparent" />
                Building multi-agent review...
              </div>
            ) : investigationError ? (
              <div className="mt-3 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/5 px-3 py-2 text-xs text-[var(--danger)]">
                Multi-agent analysis is unavailable because the investigation request failed.
              </div>
            ) : agentAnalysis ? (
              <div className="mt-3 space-y-3">
                <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                  {[
                    { label: "Overall risk", value: agentAnalysis.consensus.overall_risk_level },
                    { label: "Avg confidence", value: formatPercent(agentAnalysis.consensus.average_confidence) },
                    { label: "Conflict score", value: formatPercent(agentAnalysis.consensus.conflict_score) },
                    { label: "Providers", value: String(agentAnalysis.consensus.providers_used.length || 1) },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5">
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{item.value}</p>
                    </div>
                  ))}
                </div>

                {investigationRecommendations.length ? (
                  <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 py-3">
                    <p className="mb-2 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
                      <Sparkles className="h-3.5 w-3.5" />
                      Consensus actions
                    </p>
                    <ul className="space-y-1.5 text-[11px] text-[var(--text-muted)]">
                      {investigationRecommendations.slice(0, 5).map((recommendation, index) => (
                        <li key={`${index}-${recommendation}`} className="flex gap-2">
                          <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                          <span>{recommendation}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                <div className="space-y-2.5">
                  {agentAnalysis.opinions.map((opinion) => (
                    <article key={`${opinion.agent_name}-${opinion.model}-${opinion.provider}`} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-semibold text-[var(--foreground)]">{formatAgentLabel(opinion.agent_name)}</p>
                          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-[var(--text-muted)]">
                            {opinion.provider.replaceAll("_", " ")} · {opinion.model}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">
                            {formatPercent(opinion.confidence)}
                          </span>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${opinion.external ? "bg-[#00b894]/10 text-[#00b894]" : "bg-[var(--background)] text-[var(--text-muted)]"}`}>
                            {opinion.external ? "External" : "Local"}
                          </span>
                        </div>
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">{opinion.summary}</p>
                      {opinion.recommendations.length ? (
                        <ul className="mt-3 space-y-1.5 text-[11px] text-[var(--text-muted)]">
                          {opinion.recommendations.slice(0, 3).map((recommendation, index) => (
                            <li key={`${opinion.agent_name}-${index}`} className="flex gap-2">
                              <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                              <span>{recommendation}</span>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-[var(--card-border)] px-3 py-3 text-xs text-[var(--text-muted)]">
                No agent panel is attached to this investigation yet. Use refresh to request the latest AI review bundle.
              </div>
            )}
          </div>

          <div className="mb-4 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="mb-1 inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
                  <ClipboardList className="h-3.5 w-3.5" />
                  Human review evidence
                </p>
                <p className="text-[11px] text-[var(--text-muted)]">
                  Manual audits stay separate from pathway generation, but any audit linked to {activeCase.case_id} is surfaced here for investigation context.
                </p>
              </div>
              <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">
                {linkedManualAudits.length} linked
              </span>
            </div>

            {manualAuditsLoading ? (
              <div className="mt-3 text-xs text-[var(--text-muted)]">Loading linked manual audits...</div>
            ) : manualAuditError ? (
              <div className="mt-3 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger)]/5 px-3 py-2 text-xs text-[var(--danger)]">
                {manualAuditError}
              </div>
            ) : linkedManualAudits.length ? (
              <div className="mt-3 space-y-2.5">
                {linkedManualAudits.map((audit) => (
                  <article key={audit.audit_id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3.5 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-[10px] font-bold text-[var(--text-muted)]">{audit.audit_id}</p>
                        <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{audit.vendor_id}</p>
                      </div>
                      <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">
                        {audit.severity}
                      </span>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-[var(--text-muted)]">
                      {audit.notes || "No audit notes were attached to this manual review."}
                    </p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                      <span>By: <span className="font-semibold">{audit.auditor_id}</span></span>
                      <span>•</span>
                      <span>{formatAuditDate(audit.created_at)}</span>
                      <span>•</span>
                      <span className="capitalize">{audit.status}</span>
                    </div>
                    {audit.findings.length ? (
                      <ul className="mt-3 space-y-1.5 text-[11px] text-[var(--text-muted)]">
                        {audit.findings.slice(0, 3).map((finding, index) => (
                          <li key={`${audit.audit_id}-${index}`} className="flex gap-2">
                            <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                            <span>{finding}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-dashed border-[var(--card-border)] px-3 py-3 text-xs text-[var(--text-muted)]">
                No manual audits are currently linked to {activeCase.case_id}.
              </div>
            )}
          </div>

          {/* Rules & Actors */}
          <div className="mb-4">
            <p className="panel-title mb-2">Rules Triggered</p>
            <div className="flex flex-wrap gap-1.5">
              {activeCase.rules_triggered.map((r) => (
                <span key={r} className="rounded-full bg-[var(--background)] px-2.5 py-1 text-[10px] font-medium">{r}</span>
              ))}
            </div>
          </div>
          <div className="mb-4">
            <p className="panel-title mb-2">Actors</p>
            <div className="flex flex-wrap gap-1.5">
              {activeCase.actors_involved.map((a) => (
                <span key={a} className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-semibold text-[var(--primary)]">{a}</span>
              ))}
            </div>
          </div>

          {/* Event Timeline */}
          {investigation?.sequence_of_events?.length ? (
            <div className="rounded-2xl bg-[var(--background)] px-4 py-3.5">
              <p className="panel-title mb-3 inline-flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-[var(--primary)]" />
                EVENT TIMELINE
              </p>
              <div className="relative space-y-0 pl-4">
                <div className="absolute left-[6.5px] top-1 bottom-1 w-px bg-[var(--primary)] bg-opacity-30 dark:bg-opacity-40" />
                {investigation.sequence_of_events.map((step, i) => (
                  <div key={`${i}-${step}`} className="relative flex gap-3 py-1.5 text-[11px] text-[var(--text-muted)]">
                    <span className="relative z-10 mt-[3px] inline-block h-2 w-2 shrink-0 rounded-full border-2 border-[var(--primary)] bg-[var(--card-bg)]" />
                    <span className="leading-relaxed">{step}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}
