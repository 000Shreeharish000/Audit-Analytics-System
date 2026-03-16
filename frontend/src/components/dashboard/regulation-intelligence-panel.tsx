"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight, Bell, ChevronDown, ExternalLink,
  FileSearch, FileUp, PenLine, RefreshCw, ScanSearch, Zap,
} from "lucide-react";
import { createRegulatorySignal, getRegulatorySignals, uploadRegulatorySignalDoc } from "@/lib/api";
import type { BackendRegulatorySignal } from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";

const STEPS = [
  {
    icon: FileSearch,
    title: "Read the circular",
    body: "Regulatory portals (IFSCA, SEBI, RBI) are monitored continuously. New circulars and amendments are ingested the moment they are published.",
    color: "#6c5ce7",
  },
  {
    icon: ScanSearch,
    title: "Extract requirements",
    body: "NLP models parse the regulatory text to surface compliance obligations, effective dates, thresholds, and applicable entity types.",
    color: "#a29bfe",
  },
  {
    icon: ArrowRight,
    title: "Check company data",
    body: "Extracted rules are applied against current enterprise data — transactions, approvals, vendor records — to detect gaps or breaches in real time.",
    color: "#00cec9",
  },
  {
    icon: Bell,
    title: "Alert management",
    body: "Any detected gap or breach generates an explainable alert for the CFO, CRO, or audit committee before a regulatory deadline is missed.",
    color: "#55efc4",
  },
];

// Re-export the backend type under the legacy alias so policy-reference-viewer
// can be updated independently without a hard import break.
export type RegulatorySignal = BackendRegulatorySignal;

export function RegulationIntelligencePanel() {
  const token = useDashboardStore((state) => state.token);
  const [signals, setSignals] = useState<BackendRegulatorySignal[]>([]);
  const [selectedSignal, setSelectedSignal] = useState<string | null>(null);
  const [ruleTitle, setRuleTitle] = useState("");
  const [ruleDraft, setRuleDraft] = useState("");
  const [uploadedFile, setUploadedFile] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [ruleStatus, setRuleStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [fetchLoading, setFetchLoading] = useState(false);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const loadSignals = useCallback(async () => {
    if (!token) return;
    setFetchLoading(true);
    setFetchError(null);
    try {
      const data = await getRegulatorySignals(token);
      setSignals(data);
      setFetchedAt(new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }));
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch signals");
    } finally {
      setFetchLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void loadSignals();
  }, [loadSignals]);

  const handleFetch = () => { void loadSignals(); };

  const handleAddRule = async () => {
    if (!ruleTitle.trim() || !ruleDraft.trim() || !token) return;
    setRuleStatus("saving");
    try {
      const today = new Date().toISOString().slice(0, 10);
      const newSignal = await createRegulatorySignal(token, {
        regulator: "CUSTOM",
        circular: `CUSTOM/${Date.now()}`,
        topic: ruleTitle.trim(),
        signal_date: today,
        effective_date: today,
        summary: ruleDraft.trim().slice(0, 500),
        full_description: ruleDraft.trim(),
        requirements: [],
      });
      setSignals((prev) => [newSignal, ...prev]);
      setRuleTitle("");
      setRuleDraft("");
      setRuleStatus("done");
      setTimeout(() => setRuleStatus("idle"), 3000);
    } catch {
      setRuleStatus("error");
      setTimeout(() => setRuleStatus("idle"), 3000);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !token) return;
    setUploadedFile(file.name);
    setUploadStatus("uploading");
    try {
      const result = await uploadRegulatorySignalDoc(token, {
        regulator: "UPLOADED",
        topic: file.name.replace(/\.[^.]+$/, ""),
        files: [file],
      });
      setSignals((prev) => [...result.signals, ...prev]);
      setUploadStatus("done");
    } catch {
      setUploadStatus("error");
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="neo-card px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[var(--primary)]/10 px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">
              <Zap className="h-3 w-3" />
              Unique platform capability
            </div>
            <h2 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">Global Regulation Intelligence Engine</h2>
            <p className="mt-2 max-w-xl text-sm leading-7 text-[var(--text-muted)]">
              When a regulator issues a new circular, the platform reads, extracts, checks, and alerts — automatically and continuously.
              No human needs to monitor regulatory portals or manually update compliance rules.
            </p>
          </div>
          <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3 text-center xl:min-w-[200px]">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">Monitoring</p>
            <p className="mt-1 text-lg font-bold text-[var(--foreground)]">IFSCA · SEBI · RBI</p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">Regulatory portals tracked</p>
          </div>
        </div>

        {/* 4-step flow */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {STEPS.map((step, index) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: index * 0.07 }}
                className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] font-bold" style={{ color: step.color }}>
                    0{index + 1}
                  </span>
                  <div className="rounded-xl p-1.5" style={{ backgroundColor: `${step.color}18`, color: step.color }}>
                    <Icon className="h-3.5 w-3.5" />
                  </div>
                </div>
                <h3 className="mt-3 text-sm font-semibold text-[var(--foreground)]">{step.title}</h3>
                <p className="mt-2 text-[11px] leading-5 text-[var(--text-muted)]">{step.body}</p>
                <div className="mt-3 h-0.5 w-8 rounded-full" style={{ backgroundColor: step.color }} />
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Recent regulatory signals — clickable */}
      <div className="neo-card px-5 py-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Recent regulatory signals</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">
              Latest circulars from IFSCA, SEBI &amp; RBI — click any row for full details
              {fetchedAt && <span className="ml-2 text-green-400">· refreshed at {fetchedAt}</span>}
              {fetchError && <span className="ml-2 text-red-400">· {fetchError}</span>}
            </p>
          </div>
          <button
            onClick={handleFetch}
            disabled={fetchLoading}
            className="inline-flex items-center gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2 text-[11px] font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--panel)] disabled:opacity-60"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${fetchLoading ? "animate-spin" : ""}`} />
            {fetchLoading ? "Fetching..." : "Fetch latest"}
          </button>
        </div>
        <div className="space-y-2">
          {signals.map((signal) => {
            const isOpen = selectedSignal === signal.circular;
            return (
              <div key={signal.signal_id}>
                <button
                  onClick={() => setSelectedSignal(isOpen ? null : signal.circular)}
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
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
          {!fetchLoading && signals.length === 0 && (
            <p className="py-4 text-center text-sm text-[var(--text-muted)]">No regulatory signals available. Click &quot;Fetch latest&quot; to refresh.</p>
          )}
        </div>
      </div>

      {/* Admin: Write a rule */}
      <div className="neo-card px-5 py-5">
        <div className="mb-4 flex items-center gap-2">
          <PenLine className="h-4 w-4 text-[var(--primary)]" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Write a compliance rule</p>
        </div>
        <div className="space-y-3">
          <input
            type="text"
            value={ruleTitle}
            onChange={(e) => setRuleTitle(e.target.value)}
            placeholder="Rule title (e.g. SEBI RPT Approval Gate)"
            className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <textarea
            value={ruleDraft}
            onChange={(e) => setRuleDraft(e.target.value)}
            placeholder="Write the rule text here. Describe the obligation, threshold, and consequence of breach..."
            rows={4}
            className="w-full resize-none rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5 text-sm text-[var(--foreground)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleAddRule}
              disabled={!ruleTitle.trim() || !ruleDraft.trim() || ruleStatus === "saving"}
              className="inline-flex items-center gap-2 rounded-2xl bg-[var(--primary)] px-4 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {ruleStatus === "saving" ? (
                <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> Saving…</>
              ) : "Add rule"}
            </button>
            {ruleStatus === "done" && (
              <span className="text-[11px] font-semibold text-green-400">✓ Rule saved to backend</span>
            )}
            {ruleStatus === "error" && (
              <span className="text-[11px] font-semibold text-red-400">✗ Failed to save — check connection</span>
            )}
          </div>
        </div>
      </div>

      {/* Admin: Upload document */}
      <div className="neo-card px-5 py-5">
        <div className="mb-4 flex items-center gap-2">
          <FileUp className="h-4 w-4 text-[var(--primary)]" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--primary)]">Upload regulatory document</p>
        </div>
        <label className="block cursor-pointer">
          <input type="file" accept=".pdf,.docx,.txt" onChange={handleFileChange} className="sr-only" />
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--background)] px-6 py-8 text-center transition-colors hover:border-[var(--primary)]/50 hover:bg-[var(--panel)]">
            <FileUp className="mb-2 h-6 w-6 text-[var(--text-muted)]" />
            <p className="text-sm font-semibold text-[var(--foreground)]">Drop PDF, DOCX or TXT here</p>
            <p className="mt-1 text-[11px] text-[var(--text-muted)]">or click to browse — max 10 MB</p>
          </div>
        </label>
        {uploadedFile && (
          <div className={`mt-3 flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[11px] ${
            uploadStatus === "uploading" ? "border-[var(--primary)]/25 bg-[var(--primary)]/8 text-[var(--primary)]"
            : uploadStatus === "error" ? "border-red-500/25 bg-red-500/8 text-red-400"
            : "border-green-500/25 bg-green-500/8 text-green-400"
          }`}>
            {uploadStatus === "uploading" && <RefreshCw className="h-3 w-3 animate-spin" />}
            {uploadStatus !== "uploading" && <span className="h-1.5 w-1.5 rounded-full bg-current" />}
            {uploadStatus === "uploading" && `Uploading ${uploadedFile}…`}
            {uploadStatus === "done" && `${uploadedFile} — ingested and saved to backend`}
            {uploadStatus === "error" && `${uploadedFile} — upload failed, please try again`}
          </div>
        )}
      </div>
    </div>
  );
}

