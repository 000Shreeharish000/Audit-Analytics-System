"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  ClipboardList,
  FileCheck,
  Loader2,
  Plus,
  Send,
  X,
} from "lucide-react";
import { fetchManualAudits, submitManualAudit } from "@/lib/api";
import type { ManualAuditRecord, ManualAuditRequest } from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "#00b894",
  MEDIUM: "#f39c12",
  HIGH: "#e17055",
  CRITICAL: "#e74c3c",
};

function formatAuditDate(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ManualAuditPanel() {
  const graph = useDashboardStore((s) => s.graph);
  const cases = useDashboardStore((s) => s.cases);
  const token = useDashboardStore((s) => s.token);
  const openInvestigation = useDashboardStore((s) => s.openInvestigation);
  const setActiveAuditorSection = useDashboardStore((s) => s.setActiveAuditorSection);

  const [records, setRecords] = useState<ManualAuditRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [newFinding, setNewFinding] = useState("");
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  // Form state
  const [form, setForm] = useState({
    vendorId: "",
    caseIds: [] as string[],
    severity: "MEDIUM",
    notes: "",
    findings: [] as string[],
    recommendedAction: "",
  });

  /* ─── Load existing records ─── */
  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setError(null);
    fetchManualAudits(token)
      .then(setRecords)
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Failed to load audit records"))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    if (!records.length) {
      setSelectedAuditId(null);
      return;
    }
    if (!selectedAuditId || !records.some((record) => record.audit_id === selectedAuditId)) {
      setSelectedAuditId(records[0].audit_id);
    }
  }, [records, selectedAuditId]);

  /* ─── Derived lists ─── */
  const vendors = useMemo(() => {
    if (!graph?.nodes) return [];
    return graph.nodes
      .filter((n) => n.type?.toLowerCase().includes("vendor"))
      .map((n) => ({ id: n.id as string, label: (n.label ?? n.id) as string }))
      .filter((v, i, a) => a.findIndex((x) => x.id === v.id) === i);
  }, [graph]);

  const selectedAudit = useMemo(
    () => records.find((record) => record.audit_id === selectedAuditId) ?? null,
    [records, selectedAuditId],
  );

  const auditSummary = useMemo(() => {
    const open = records.filter((record) => record.status === "open").length;
    const escalated = records.filter((record) => record.status === "escalated").length;
    const highPriority = records.filter((record) => record.severity === "HIGH" || record.severity === "CRITICAL").length;
    return { open, escalated, highPriority };
  }, [records]);

  const handleAddFinding = () => {
    if (!newFinding.trim()) return;
    setForm((f) => ({ ...f, findings: [...f.findings, newFinding.trim()] }));
    setNewFinding("");
  };

  const handleRemoveFinding = (i: number) =>
    setForm((f) => ({ ...f, findings: f.findings.filter((_, idx) => idx !== i) }));

  const handleToggleCase = (caseId: string) => {
    setForm((f) => ({
      ...f,
      caseIds: f.caseIds.includes(caseId)
        ? f.caseIds.filter((c) => c !== caseId)
        : [...f.caseIds, caseId],
    }));
  };

  const handleSubmit = async () => {
    if (!token || !form.vendorId) return;
    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);
    const payload: ManualAuditRequest = {
      vendor_id: form.vendorId,
      case_ids: form.caseIds,
      severity: form.severity,
      notes: form.notes,
      findings: form.findings,
      recommended_action: form.recommendedAction,
    };

    try {
      const result = await submitManualAudit(token, payload);
      setRecords((prev) => [result, ...prev]);
      setSelectedAuditId(result.audit_id);
      setForm({ vendorId: "", caseIds: [], severity: "MEDIUM", notes: "", findings: [], recommendedAction: "" });

      const visibleLinkedCaseId = result.case_ids.find((caseId) => cases.some((item) => item.case_id === caseId)) ?? null;
      if (visibleLinkedCaseId) {
        setActiveAuditorSection("investigation");
        void openInvestigation(visibleLinkedCaseId);
      } else {
        const message = result.case_ids.length
          ? "Manual audit submitted. Linked case IDs were saved, but none are currently visible in your investigation list."
          : "Manual audit submitted successfully.";
        setSuccessMessage(message);
        window.setTimeout(() => setSuccessMessage(null), 4000);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit audit. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto custom-scrollbar px-1 py-1">
      {/* ── Form ── */}
      <section className="neo-card p-5 shrink-0">
        <div className="mb-4 flex items-center gap-2">
          <div className="rounded-xl bg-[var(--primary)]/10 p-1.5">
            <ClipboardList className="h-4 w-4 text-[var(--primary)]" />
          </div>
          <p className="text-sm font-bold">Initiate Manual Audit</p>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {/* Vendor */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Vendor *
            </label>
            <select
              value={form.vendorId}
              onChange={(e) => setForm((f) => ({ ...f, vendorId: e.target.value }))}
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-xs outline-none focus:border-[var(--primary)] transition-colors"
            >
              <option value="">Select vendor...</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.label} ({v.id})</option>
              ))}
            </select>
          </div>

          {/* Severity */}
          <div>
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Severity Assessment
            </label>
            <div className="flex gap-2">
              {["LOW", "MEDIUM", "HIGH", "CRITICAL"].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, severity: s }))}
                  className={`flex-1 rounded-xl py-2.5 text-[10px] font-bold transition-all ${
                    form.severity === s
                      ? "text-white shadow-md"
                      : "bg-[var(--background)] text-[var(--text-muted)]"
                  }`}
                  style={
                    form.severity === s
                      ? { backgroundColor: SEVERITY_COLORS[s], boxShadow: `0 4px 12px ${SEVERITY_COLORS[s]}40` }
                      : {}
                  }
                >
                  {s[0]}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Audit Notes
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Describe the intent and scope of this manual audit..."
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-xs outline-none focus:border-[var(--primary)] transition-colors resize-none"
            />
          </div>

          {/* Findings */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Key Findings
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={newFinding}
                onChange={(e) => setNewFinding(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddFinding()}
                placeholder="Add a finding and press Enter..."
                className="flex-1 rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-xs outline-none focus:border-[var(--primary)] transition-colors"
              />
              <button
                type="button"
                onClick={handleAddFinding}
                className="rounded-xl bg-[var(--primary)]/10 px-3 py-2.5 text-[var(--primary)] hover:bg-[var(--primary)]/20 transition-colors"
              >
                <Plus className="h-4 w-4" />
              </button>
            </div>
            {form.findings.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {form.findings.map((f, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl bg-[var(--background)] px-3 py-2">
                    <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                    <span className="flex-1 text-xs leading-relaxed">{f}</span>
                    <button type="button" onClick={() => handleRemoveFinding(i)} className="text-[var(--text-muted)] hover:text-[var(--danger)]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recommended Action */}
          <div className="md:col-span-2">
            <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
              Recommended Action
            </label>
            <input
              type="text"
              value={form.recommendedAction}
              onChange={(e) => setForm((f) => ({ ...f, recommendedAction: e.target.value }))}
              placeholder="e.g. Escalate to compliance team, block vendor payments..."
              className="w-full rounded-xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-xs outline-none focus:border-[var(--primary)] transition-colors"
            />
          </div>

          {/* Linked Cases */}
          {cases.length > 0 && (
            <div className="md:col-span-2">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">
                Link Cases (optional)
              </label>
              <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
                {cases.slice(0, 20).map((c) => (
                  <button
                    key={c.case_id}
                    type="button"
                    onClick={() => handleToggleCase(c.case_id)}
                    className={`rounded-full px-3 py-1 text-[10px] font-semibold transition-all ${
                      form.caseIds.includes(c.case_id)
                        ? "bg-[var(--primary)] text-white"
                        : "bg-[var(--background)] text-[var(--text-muted)] hover:text-[var(--foreground)]"
                    }`}
                  >
                    {c.case_id}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Error / Success */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-2 rounded-xl bg-red-50 px-4 py-3 text-xs text-[var(--danger)] dark:bg-red-500/10">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {error}
            </motion.div>
          )}
          {successMessage && (
            <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-3 flex items-center gap-2 rounded-xl bg-green-50 px-4 py-3 text-xs text-[#00b894] dark:bg-green-500/10">
              <CheckCircle className="h-4 w-4 shrink-0" />
              {successMessage}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="mt-4 flex items-center justify-between">
          <p className="text-[10px] text-[var(--text-muted)]">
            Severity: <span className="font-bold" style={{ color: SEVERITY_COLORS[form.severity] }}>{form.severity}</span>
            {form.vendorId && <> · Vendor: <span className="font-bold">{form.vendorId}</span></>}
          </p>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!form.vendorId || submitting}
            className={`inline-flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold transition-all ${
              form.vendorId && !submitting
                ? "bg-gradient-to-r from-[#6c5ce7] to-[#a29bfe] text-white shadow-md hover:shadow-lg"
                : "bg-[var(--card-border)] text-[var(--text-muted)] cursor-not-allowed"
            }`}
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            Submit Audit
          </button>
        </div>
      </section>

      {/* ── Existing Records ── */}
      <section className="neo-card flex flex-col gap-3 p-5">
        <div className="flex flex-wrap items-start gap-3">
          <div className="flex items-center gap-2">
            <FileCheck className="h-4 w-4 text-[var(--primary)]" />
            <div>
              <p className="text-sm font-bold">Submitted Audits</p>
              <p className="text-[11px] text-[var(--text-muted)]">Click any submitted audit to open full details.</p>
            </div>
          </div>
          <div className="ml-auto grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-[var(--background)] px-3 py-2 text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Total</p>
              <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{records.length}</p>
            </div>
            <div className="rounded-xl bg-[var(--background)] px-3 py-2 text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Open</p>
              <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{auditSummary.open}</p>
            </div>
            <div className="rounded-xl bg-[var(--background)] px-3 py-2 text-center">
              <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">High Risk</p>
              <p className="mt-1 text-sm font-bold text-[var(--foreground)]">{auditSummary.highPriority + auditSummary.escalated}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-4 text-xs text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading audit records...
          </div>
        ) : records.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--text-muted)]">No manual audits yet.</p>
        ) : (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_360px]">
            <div className="space-y-3">
              {records.map((rec) => {
                const isSelected = selectedAuditId === rec.audit_id;
                return (
                  <motion.button
                    key={rec.audit_id}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => setSelectedAuditId(rec.audit_id)}
                    className={`w-full rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-[var(--primary)] bg-[var(--primary)]/5 shadow-[0_10px_30px_rgba(108,92,231,0.12)]"
                        : "border-[var(--card-border)] bg-[var(--background)] hover:border-[var(--primary)]/35"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-mono text-[10px] font-bold text-[var(--text-muted)]">{rec.audit_id}</p>
                        <p className="mt-0.5 text-sm font-bold text-[var(--foreground)]">{rec.vendor_id}</p>
                      </div>
                      <span
                        className="rounded-full px-2.5 py-1 text-[10px] font-bold"
                        style={{
                          backgroundColor: `${SEVERITY_COLORS[rec.severity] ?? "#6c5ce7"}15`,
                          color: SEVERITY_COLORS[rec.severity] ?? "#6c5ce7",
                        }}
                      >
                        {rec.severity}
                      </span>
                    </div>

                    <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
                      {rec.notes || "No audit notes were attached to this submission."}
                    </p>

                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
                      <span>By: <span className="font-semibold">{rec.auditor_id}</span></span>
                      <span>•</span>
                      <span>{formatAuditDate(rec.created_at)}</span>
                      <span>•</span>
                      <span>{rec.case_ids.length} linked cases</span>
                      <span className="ml-auto capitalize rounded-full bg-[var(--card-border)] px-2 py-0.5">{rec.status}</span>
                    </div>
                  </motion.button>
                );
              })}
            </div>

            <div className="rounded-3xl border border-[var(--card-border)] bg-[var(--background)] p-4">
              {selectedAudit ? (
                <>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Audit details</p>
                      <h3 className="mt-1 text-base font-semibold text-[var(--foreground)]">{selectedAudit.vendor_id}</h3>
                      <p className="mt-1 font-mono text-[10px] text-[var(--text-muted)]">{selectedAudit.audit_id}</p>
                    </div>
                    <span
                      className="rounded-full px-3 py-1 text-[10px] font-bold"
                      style={{
                        backgroundColor: `${SEVERITY_COLORS[selectedAudit.severity] ?? "#6c5ce7"}18`,
                        color: SEVERITY_COLORS[selectedAudit.severity] ?? "#6c5ce7",
                      }}
                    >
                      {selectedAudit.severity}
                    </span>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl bg-white/70 px-3 py-3 dark:bg-white/5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Auditor</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{selectedAudit.auditor_id}</p>
                    </div>
                    <div className="rounded-2xl bg-white/70 px-3 py-3 dark:bg-white/5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Status</p>
                      <p className="mt-1 text-sm font-semibold capitalize text-[var(--foreground)]">{selectedAudit.status}</p>
                    </div>
                    <div className="rounded-2xl bg-white/70 px-3 py-3 dark:bg-white/5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Submitted</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{formatAuditDate(selectedAudit.created_at)}</p>
                    </div>
                    <div className="rounded-2xl bg-white/70 px-3 py-3 dark:bg-white/5">
                      <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Linked cases</p>
                      <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{selectedAudit.case_ids.length}</p>
                    </div>
                  </div>

                  <div className="mt-4 space-y-4 text-sm text-[var(--foreground)]">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Audit notes</p>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                        {selectedAudit.notes || "No notes were added for this manual audit."}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Key findings</p>
                      {selectedAudit.findings.length ? (
                        <ul className="mt-2 space-y-2">
                          {selectedAudit.findings.map((finding, index) => (
                            <li key={`${selectedAudit.audit_id}-${index}`} className="flex gap-2 text-sm text-[var(--text-muted)]">
                              <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--primary)]" />
                              {finding}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--text-muted)]">No specific findings were listed.</p>
                      )}
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Recommended action</p>
                      <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
                        {selectedAudit.recommended_action || "No recommended action was attached yet."}
                      </p>
                    </div>

                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Linked case IDs</p>
                      {selectedAudit.case_ids.length ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {selectedAudit.case_ids.map((caseId) => (
                            <span key={caseId} className="rounded-full bg-[var(--primary)]/10 px-3 py-1 text-[10px] font-semibold text-[var(--primary)]">
                              {caseId}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-2 text-sm text-[var(--text-muted)]">No cases were linked to this audit.</p>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex min-h-[240px] items-center justify-center text-center text-sm text-[var(--text-muted)]">
                  Select a submitted audit to open its full detail view.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
