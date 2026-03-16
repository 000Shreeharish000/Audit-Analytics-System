"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, Loader2 } from "lucide-react";
import { fetchManualAudits } from "@/lib/api";
import type { ManualAuditRecord } from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "#00b894",
  MEDIUM: "#f39c12",
  HIGH: "#e17055",
  CRITICAL: "#e74c3c",
};

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function ManualAuditSnapshot({
  title,
  description,
  maxItems = 3,
}: {
  title: string;
  description: string;
  maxItems?: number;
}) {
  const token = useDashboardStore((state) => state.token);
  const [records, setRecords] = useState<ManualAuditRecord[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const loading = Boolean(token) && records.length === 0 && errorMessage === null;

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    fetchManualAudits(token)
      .then((response) => {
        if (!cancelled) {
          setRecords(response);
          setErrorMessage(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setErrorMessage(error instanceof Error ? error.message : "Unable to load manual audits.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [token]);

  const summary = useMemo(() => {
    const openCount = records.filter((record) => record.status === "open").length;
    const criticalCount = records.filter((record) => record.severity === "CRITICAL" || record.severity === "HIGH").length;
    return { openCount, criticalCount };
  }, [records]);

  return (
    <section className="neo-card px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="panel-title inline-flex items-center gap-1.5">
            <ClipboardList className="h-4 w-4 text-[var(--primary)]" />
            {title}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-[var(--text-muted)]">{description}</p>
        </div>
        <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold text-[var(--primary)]">
          {records.length} audits
        </span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[var(--background)] px-3 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Open reviews</p>
          <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{summary.openCount}</p>
        </div>
        <div className="rounded-2xl bg-[var(--background)] px-3 py-3">
          <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">High priority</p>
          <p className="mt-1 text-lg font-semibold text-[var(--foreground)]">{summary.criticalCount}</p>
        </div>
      </div>

      <div className="mt-4 space-y-2.5">
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-[var(--text-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading manual audit summary...
          </div>
        ) : errorMessage ? (
          <div className="rounded-2xl border border-[var(--danger)]/20 bg-[var(--danger)]/5 px-3 py-3 text-xs text-[var(--danger)]">
            {errorMessage}
          </div>
        ) : records.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--card-border)] px-3 py-4 text-xs text-[var(--text-muted)]">
            No manual audits have been submitted yet.
          </div>
        ) : (
          records.slice(0, maxItems).map((record) => {
            const accent = SEVERITY_COLORS[record.severity] ?? "#6c5ce7";
            return (
              <article key={record.audit_id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] font-bold text-[var(--text-muted)]">{record.audit_id}</p>
                    <p className="mt-1 text-sm font-semibold text-[var(--foreground)]">{record.vendor_id}</p>
                  </div>
                  <span className="rounded-full px-2.5 py-1 text-[10px] font-bold" style={{ backgroundColor: `${accent}15`, color: accent }}>
                    {record.severity}
                  </span>
                </div>

                <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
                  {record.notes || "No audit notes were provided for this manual review."}
                </p>

                <div className="mt-3 flex items-center gap-2 text-[10px] text-[var(--text-muted)]">
                  <span className="capitalize rounded-full bg-[var(--card-border)] px-2 py-0.5">{record.status}</span>
                  <span>•</span>
                  <span>{formatDate(record.created_at)}</span>
                  {record.case_ids.length ? (
                    <>
                      <span>•</span>
                      <span>{record.case_ids.length} linked cases</span>
                    </>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-amber-500/10 px-3 py-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
        <AlertTriangle className="h-3.5 w-3.5" />
        Manual audits are shown here as human-review evidence alongside automated detections.
      </div>
    </section>
  );
}