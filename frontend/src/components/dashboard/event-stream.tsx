"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { AlertTriangle, ExternalLink, X } from "lucide-react";
import type { TrackedEvent } from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";

function classifyEvent(eventType: string): "ingest" | "rule" | "pathway" | "security" | "generic" {
  if (eventType.includes("ingest") || eventType.includes("dataset")) return "ingest";
  if (eventType.includes("rule")) return "rule";
  if (eventType.includes("case") || eventType.includes("pathway") || eventType.includes("investigation")) return "pathway";
  if (eventType.includes("auth") || eventType.includes("audit") || eventType.includes("alert")) return "security";
  return "generic";
}

const eventColors: Record<ReturnType<typeof classifyEvent>, { bg: string; dot: string; border: string }> = {
  ingest: { bg: "bg-cyan-50", dot: "bg-cyan-500", border: "border-l-cyan-400" },
  rule: { bg: "bg-blue-50", dot: "bg-blue-500", border: "border-l-blue-400" },
  pathway: { bg: "bg-red-50", dot: "bg-red-500", border: "border-l-red-400" },
  security: { bg: "bg-amber-50", dot: "bg-amber-500", border: "border-l-amber-400" },
  generic: { bg: "bg-slate-50", dot: "bg-slate-400", border: "border-l-slate-300" },
};

function eventLabel(event: TrackedEvent): string {
  const detail = event.details ?? event.payload ?? {};
  const readable = event.event_type.replace(/_/g, " ").replace(/\b\w/g, (v) => v.toUpperCase());
  for (const key of ["case_id", "rule_id", "dataset_id", "risk_level"]) {
    if (key in detail) return `${readable} • ${key.replace(/_/g, " ")}: ${String(detail[key])}`;
  }
  return readable;
}

function formatEventTime(timestamp: string): string {
  const timePart = timestamp.split("T")[1];
  if (!timePart) return timestamp;
  return timePart.slice(0, 8);
}

function formatEventDateTime(timestamp: string): string {
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) {
    return timestamp;
  }
  return parsed.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function eventKey(event: TrackedEvent): string {
  return `${event.timestamp}:${event.event_type}:${event.actor}`;
}

function toDisplayLabel(key: string): string {
  return key.replace(/_/g, " ").replace(/\b\w/g, (value) => value.toUpperCase());
}

function mergedEventContext(event: TrackedEvent | null): Record<string, unknown> {
  if (!event) return {};
  return {
    ...(event.details ?? {}),
    ...(event.payload ?? {}),
  };
}

function stringifyJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return "Unable to render event payload.";
  }
}

export function EventStream() {
  const status = useDashboardStore((state) => state.status);
  const metrics = useDashboardStore((state) => state.metrics);
  const [selectedEventKey, setSelectedEventKey] = useState<string | null>(null);
  const liveEvents = [...(metrics?.recent_events ?? [])].reverse().slice(0, 40);
  const fallbackEvents: TrackedEvent[] = [
    { event_type: "vendor_created", actor: "system", timestamp: "2026-03-10T10:01:00Z" },
    { event_type: "invoice_issued", actor: "system", timestamp: "2026-03-10T10:01:09Z" },
    { event_type: "approval_threshold_exceeded", actor: "rule_engine", timestamp: "2026-03-10T10:01:16Z" },
    { event_type: "rule_triggered", actor: "governance_engine", timestamp: "2026-03-10T10:01:23Z" },
    { event_type: "control_bypass_detected", actor: "pathway_detector", timestamp: "2026-03-10T10:01:31Z" },
  ];
  const events = liveEvents.length ? liveEvents : fallbackEvents;
  const selectedEvent = useMemo(
    () => events.find((event) => eventKey(event) === selectedEventKey) ?? null,
    [events, selectedEventKey],
  );
  const selectedContext = useMemo(() => mergedEventContext(selectedEvent), [selectedEvent]);

  useEffect(() => {
    if (!selectedEvent) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSelectedEventKey(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [selectedEvent]);

  return (
    <>
      <aside className="neo-card flex h-full min-h-0 flex-col overflow-hidden">
        <div className="flex items-center justify-between border-b border-[var(--card-border)] px-5 py-3.5">
          <div>
            <p className="panel-title">Event Stream</p>
            <p className="mt-0.5 text-[10px] text-[var(--text-muted)]">Real-time events · click any item to open a popup</p>
          </div>
          <span className="status-pill text-[10px]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#00b894] opacity-50" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#00b894]" />
            </span>
            Live
          </span>
        </div>

        <div className="custom-scrollbar min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
          {status === "loading" && events.length === 0 && (
            <div className="rounded-2xl bg-[var(--background)] px-3 py-2.5 text-xs text-[var(--text-muted)]">
              Pulling events...
            </div>
          )}

          <AnimatePresence initial={false}>
            {events.map((event) => {
              const kind = classifyEvent(event.event_type);
              const colors = eventColors[kind];
              const key = eventKey(event);
              const isSelected = selectedEventKey === key;
              return (
                <motion.button
                  key={key}
                  type="button"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  transition={{ duration: 0.2 }}
                  onClick={() => setSelectedEventKey(key)}
                  className={`w-full rounded-xl border border-[var(--card-border)] border-l-2 px-3 py-2 text-left transition-colors hover:bg-[var(--background)] ${colors.border} ${isSelected ? "bg-[var(--background)] shadow-sm ring-1 ring-[var(--primary)]/20" : "bg-[var(--card-bg)]"}`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${colors.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[11px] font-medium">{eventLabel(event)}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
                        <span>{formatEventTime(event.timestamp)}</span>
                        <span className="h-0.5 w-0.5 rounded-full bg-[var(--text-muted)]/50" />
                        <span>{event.actor}</span>
                      </p>
                    </div>
                    <ExternalLink className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--text-muted)] transition-colors ${isSelected ? "text-[var(--primary)]" : ""}`} />
                  </div>
                </motion.button>
              );
            })}
          </AnimatePresence>

          {liveEvents.length === 0 && status === "ready" && (
            <div className="rounded-2xl bg-[var(--background)] p-3 text-xs text-[var(--text-muted)]">
              <AlertTriangle className="mb-1.5 h-3.5 w-3.5 text-[var(--primary)]" />
              Showing template events.
            </div>
          )}
        </div>

        <div className="border-t border-[var(--card-border)] bg-[var(--background)]/70 px-4 py-3">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-[var(--card-border)] bg-[var(--card-bg)] px-4 py-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Quick detail popup</p>
              <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                Open any event in a modal so the investigation layout stays compact and easy to scan.
              </p>
            </div>
            <span className="text-[10px] font-medium text-[var(--text-muted)]">{events.length} shown</span>
          </div>
        </div>
      </aside>

      <AnimatePresence>
        {selectedEvent ? (
          <motion.div
            className="fixed inset-0 z-[80] flex items-center justify-center p-4 sm:p-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <button
              type="button"
              aria-label="Close event details popup"
              className="absolute inset-0 bg-slate-950/45 backdrop-blur-[2px]"
              onClick={() => setSelectedEventKey(null)}
            />

            <motion.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="event-stream-detail-title"
              initial={{ opacity: 0, y: 18, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.98 }}
              transition={{ duration: 0.22 }}
              className="relative z-10 flex max-h-[min(86vh,760px)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] border border-[var(--card-border)] bg-[var(--card-bg)] shadow-2xl shadow-black/20"
            >
              <div className="flex items-start justify-between gap-4 border-b border-[var(--card-border)] bg-[var(--background)]/80 px-5 py-4 sm:px-6">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Detailed log</p>
                  <h3 id="event-stream-detail-title" className="mt-1 text-base font-semibold text-[var(--foreground)] sm:text-lg">
                    {eventLabel(selectedEvent)}
                  </h3>
                  <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                    {selectedEvent.event_type} · {selectedEvent.actor} · {formatEventDateTime(selectedEvent.timestamp)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedEventKey(null)}
                  className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] p-2 text-[var(--text-muted)] transition-colors hover:text-[var(--foreground)]"
                  aria-label="Close event details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6 sm:py-5">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Event Type</p>
                    <p className="mt-1.5 break-words text-sm font-semibold text-[var(--foreground)]">{selectedEvent.event_type}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Actor</p>
                    <p className="mt-1.5 break-words text-sm font-semibold text-[var(--foreground)]">{selectedEvent.actor}</p>
                  </div>
                  <div className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3">
                    <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">Occurred At</p>
                    <p className="mt-1.5 break-words text-sm font-semibold text-[var(--foreground)]">{formatEventDateTime(selectedEvent.timestamp)}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-[24px] border border-[var(--card-border)] bg-[var(--background)]/65 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Structured context</p>
                      <p className="mt-1 text-[11px] text-[var(--text-muted)]">Case IDs, rule IDs, actors, severity, and other extracted fields are summarized here.</p>
                    </div>
                    <span className="text-[10px] font-medium text-[var(--text-muted)]">{Object.keys(selectedContext).length} fields</span>
                  </div>

                  {Object.keys(selectedContext).length ? (
                    <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                      {Object.entries(selectedContext).map(([key, value]) => (
                        <div key={key} className="rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5">
                          <p className="text-[9px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)]">{toDisplayLabel(key)}</p>
                          <p className="mt-1 break-words text-[11px] font-medium text-[var(--foreground)]">{String(value)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-3 rounded-xl border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-2.5 text-[11px] text-[var(--text-muted)]">
                      This event does not include additional structured fields.
                    </div>
                  )}
                </div>

                <div className="mt-4 grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[24px] border border-[var(--card-border)] bg-[var(--background)]/65 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Details payload</p>
                    <pre className="custom-scrollbar mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--card-bg)] px-3 py-2 text-[10px] leading-5 text-[var(--foreground)]">{stringifyJson(selectedEvent.details)}</pre>
                  </div>
                  <div className="rounded-[24px] border border-[var(--card-border)] bg-[var(--background)]/65 p-4">
                    <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Event payload</p>
                    <pre className="custom-scrollbar mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--card-bg)] px-3 py-2 text-[10px] leading-5 text-[var(--foreground)]">{stringifyJson(selectedEvent.payload)}</pre>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </>
  );
}
