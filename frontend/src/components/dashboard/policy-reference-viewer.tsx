"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpenText, ChevronDown, ExternalLink, FileText, Loader2, Radio, Scale, ShieldCheck } from "lucide-react";
import { getPolicyWorkspace, getRegulatorySignals } from "@/lib/api";
import type { BackendRegulatorySignal, CompanyPolicyProfile, CompanyPolicyWorkspaceResponse } from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";

function formatDate(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function sourceLabel(source: string): string {
  if (source === "company") return "Company policy";
  if (source === "government") return "Law / regulation";
  return "Compliance rule";
}

export function PolicyReferenceViewer() {
  const token = useDashboardStore((state) => state.token);
  const cases = useDashboardStore((state) => state.cases);
  const derivedCompanyId = useMemo(() => cases[0]?.company_id ?? "", [cases]);
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);

  const [workspace, setWorkspace] = useState<CompanyPolicyWorkspaceResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [signals, setSignals] = useState<BackendRegulatorySignal[]>([]);
  const [signalsLoading, setSignalsLoading] = useState(false);

  const loadWorkspace = useCallback(async () => {
    if (!token || !derivedCompanyId) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      const response = await getPolicyWorkspace(token, derivedCompanyId);
      setWorkspace(response);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load rule and law reference.");
    } finally {
      setLoading(false);
    }
  }, [derivedCompanyId, token]);

  useEffect(() => {
    void loadWorkspace();
  }, [loadWorkspace]);

  const loadSignals = useCallback(async () => {
    if (!token) return;
    setSignalsLoading(true);
    try {
      const data = await getRegulatorySignals(token);
      setSignals(data);
    } catch {
      // silently fail — auditor view is supplementary
    } finally {
      setSignalsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSignals();
  }, [loadSignals]);

  const activePolicy: CompanyPolicyProfile | null = workspace?.draft_policy ?? workspace?.published_policy ?? null;

  return (
    <div className="custom-scrollbar flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-4 pr-1">
      <section className="neo-card px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Rules & law reference</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--foreground)]">
              Read-only audit engine scope for the current company
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              Auditors can review the active rules, compliance tags, thresholds, and ingested law sources here.
              Creating, uploading, and syncing policy changes remains admin-only.
            </p>
          </div>

          <button
            onClick={() => void loadWorkspace()}
            disabled={loading || !derivedCompanyId}
            className="inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--panel)] disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            {loading ? "Refreshing..." : "Refresh reference"}
          </button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl bg-[var(--background)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Company ID</p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">{derivedCompanyId || "Not available"}</p>
          </div>
          <div className="rounded-2xl bg-[var(--background)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Rules in scope</p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">{activePolicy?.rules.length ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-[var(--background)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Compliance tags</p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">{activePolicy?.compliance_tags.length ?? 0}</p>
          </div>
          <div className="rounded-2xl bg-[var(--background)] px-4 py-3">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Policy documents</p>
            <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">{workspace?.documents.length ?? 0}</p>
          </div>
        </div>
      </section>

      {/* Read-only: Regulatory signals from Admin */}
      <section className="neo-card px-5 py-5">
        <div className="mb-4 flex items-center gap-2">
          <Radio className="h-4 w-4 text-[var(--primary)]" />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Regulatory signals (read-only)</p>
            <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
              Circulars ingested by the Admin — click any row to view compliance details
              {signalsLoading && <span className="ml-2 text-[var(--primary)]">· Loading…</span>}
            </p>
          </div>
        </div>
        <div className="space-y-2">
          {signals.map((signal) => {
            const isOpen = selectedSignal === signal.signal_id;
            return (
              <div key={signal.signal_id}>
                <button
                  onClick={() => setSelectedSignal(isOpen ? null : signal.signal_id)}
                  className="flex w-full flex-col gap-1.5 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-left transition-colors hover:bg-[var(--panel)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-0.5 text-[10px] font-bold text-[var(--primary)]">{signal.regulator}</span>
                    <span className="font-mono text-[10px] text-[var(--text-muted)]">{signal.circular}</span>
                    <span className="text-sm font-medium text-[var(--foreground)]">{signal.topic}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${signal.status === "Gap detected" ? "bg-red-500/10 text-red-400" : "bg-green-500/10 text-green-400"}`}>
                      {signal.status}
                    </span>
                    <span className="text-[10px] text-[var(--text-muted)]">{signal.signal_date}</span>
                    <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform ${isOpen ? "rotate-180" : ""}`} />
                  </div>
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      key="detail"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="overflow-hidden"
                    >
                      <div className="mt-1 rounded-2xl border border-[var(--card-border)] bg-[var(--panel)] px-5 py-4">
                        <p className="text-xs leading-relaxed text-[var(--foreground)]">{signal.full_description || signal.summary}</p>
                        {signal.requirements.length > 0 && (
                          <div className="mt-3 space-y-1.5">
                            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Compliance requirements</p>
                            {signal.requirements.map((req) => (
                              <div key={req} className="flex items-start gap-2 text-[11px] text-[var(--text-muted)]">
                                <span className="mt-1.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--primary)]" />
                                {req}
                              </div>
                            ))}
                          </div>
                        )}
                        {signal.gap && (
                          <div className="mt-3 rounded-xl border border-red-500/25 bg-red-500/8 px-4 py-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-400">Compliance gap detected</p>
                            <p className="mt-1 text-[11px] text-[var(--text-muted)]">{signal.gap}</p>
                          </div>
                        )}
                        <div className="mt-4 flex flex-wrap gap-4 text-[10px] text-[var(--text-muted)]">
                          <span>Effective: <strong className="text-[var(--foreground)]">{signal.effective_date}</strong></span>
                          {signal.source_url && (
                            <a href={signal.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[var(--primary)] hover:underline">
                              <ExternalLink className="h-3 w-3" /> Official source
                            </a>
                          )}
                          <span className="ml-auto rounded-full bg-[var(--background)] px-2.5 py-0.5 text-[10px] font-bold text-[var(--text-muted)]">Read-only · Auditor view</span>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {!signalsLoading && signals.length === 0 && (
            <p className="py-4 text-center text-sm text-[var(--text-muted)]">No regulatory signals available yet.</p>
          )}
        </div>
      </section>

      {errorMessage ? (
        <section className="neo-card border border-[var(--danger)]/20 bg-[var(--danger)]/5 px-5 py-4 text-sm text-[var(--danger)]">
          {errorMessage}
        </section>
      ) : null}

      {!activePolicy && !loading ? (
        <section className="neo-card px-5 py-10 text-center text-sm text-[var(--text-muted)]">
          No active policy profile is available yet for this audit workspace.
        </section>
      ) : null}

      {activePolicy ? (
        <>
          <section className="neo-card px-5 py-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="panel-title inline-flex items-center gap-1.5">
                  <Scale className="h-4 w-4 text-[var(--primary)]" />
                  Active thresholds & compliance tags
                </p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  {activePolicy.company_name} · version {activePolicy.version} · updated {formatDate(activePolicy.updated_at)}
                </p>
              </div>
              <span className="rounded-full bg-[var(--primary)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
                {activePolicy.status}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              {Object.entries(activePolicy.thresholds).map(([key, value]) => (
                <div key={key} className="rounded-2xl bg-[var(--background)] px-4 py-3">
                  <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">
                    {key.replaceAll("_", " ")}
                  </p>
                  <p className="mt-1.5 text-sm font-semibold text-[var(--foreground)]">{String(value)}</p>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {activePolicy.compliance_tags.length ? activePolicy.compliance_tags.map((tag) => (
                <span key={tag} className="rounded-full bg-[var(--primary)]/10 px-3 py-1 text-[11px] font-semibold text-[var(--primary)]">
                  {tag}
                </span>
              )) : (
                <span className="text-xs text-[var(--text-muted)]">No compliance tags are currently attached.</span>
              )}
            </div>
          </section>

          <section className="neo-card px-5 py-5">
            <p className="panel-title inline-flex items-center gap-1.5">
              <BookOpenText className="h-4 w-4 text-[var(--primary)]" />
              Rules currently enforced by the audit engine
            </p>
            <div className="mt-4 space-y-3">
              {activePolicy.rules.length ? activePolicy.rules.map((rule) => (
                <article key={rule.rule_id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-[10px] font-bold text-[var(--text-muted)]">{rule.rule_id}</p>
                      <h3 className="mt-1 text-sm font-semibold text-[var(--foreground)]">{rule.title}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">
                        {sourceLabel(rule.source)}
                      </span>
                      <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        Severity {rule.severity}
                      </span>
                    </div>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{rule.content}</p>
                  <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-[var(--text-muted)]">
                    <span>Effective from: {formatDate(rule.effective_from)}</span>
                    <span>Effective to: {formatDate(rule.effective_to)}</span>
                  </div>
                </article>
              )) : (
                <p className="text-sm text-[var(--text-muted)]">No rules are currently in scope.</p>
              )}
            </div>
          </section>

          <section className="neo-card px-5 py-5">
            <p className="panel-title inline-flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-[var(--primary)]" />
              Ingested policy / law documents
            </p>
            <div className="mt-4 space-y-3">
              {workspace?.documents.length ? workspace.documents.map((document) => (
                <article key={document.document_id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">{document.filename}</p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                        {sourceLabel(document.source)} · uploaded by {document.uploaded_by} · {formatDate(document.uploaded_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">
                      {document.rule_count} rules extracted
                    </span>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">{document.excerpt || "No excerpt available."}</p>
                </article>
              )) : (
                <p className="text-sm text-[var(--text-muted)]">No policy documents have been ingested yet.</p>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}