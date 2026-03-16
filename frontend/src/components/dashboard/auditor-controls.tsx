"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { FastForward, Pause, Play, RefreshCw, Rewind } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";

export function AuditorControls() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineValue, setTimelineValue] = useState(100);
  const bypassDetected = useDashboardStore((state) => state.bypassDetected);
  const status = useDashboardStore((state) => state.status);
  const cases = useDashboardStore((state) => state.cases);
  const activeCaseId = useDashboardStore((state) => state.activeCaseId);
  const refreshPipeline = useDashboardStore((state) => state.refreshPipeline);
  const openInvestigation = useDashboardStore((state) => state.openInvestigation);

  const isRefreshing = status === "loading";

  return (
    <div className="pointer-events-none absolute inset-x-4 bottom-4 z-30 flex flex-col gap-3">
      <div className="glass-deep pointer-events-auto rounded-2xl border border-border/80 p-3 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <p className="panel-title">Auditor Controls</p>
          <button
            onClick={() => {
              void refreshPipeline();
            }}
            disabled={isRefreshing}
            className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold ${
              bypassDetected
                ? "border-danger/40 bg-danger/15 text-danger"
                : "border-primary/45 bg-primary-soft text-foreground"
            } ${isRefreshing ? "cursor-not-allowed opacity-70" : ""}`}
          >
            {isRefreshing ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            {isRefreshing ? "Running..." : "Run Detection"}
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1">
            <button className="rounded-full p-2 text-foreground/70 transition-colors duration-micro hover:bg-white/10 hover:text-foreground">
              <Rewind className="h-4 w-4" />
            </button>
            <button
              onClick={() => setIsPlaying((previous) => !previous)}
              className="rounded-full border border-primary/35 bg-primary-soft p-2.5 text-foreground"
            >
              {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
            </button>
            <button className="rounded-full p-2 text-foreground/70 transition-colors duration-micro hover:bg-white/10 hover:text-foreground">
              <FastForward className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1">
            <input
              type="range"
              min="0"
              max="100"
              value={timelineValue}
              onChange={(event) => setTimelineValue(Number(event.target.value))}
              className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10"
              style={{
                background: `linear-gradient(to right, #22d3ee 0%, #22d3ee ${timelineValue}%, rgba(255,255,255,0.18) ${timelineValue}%, rgba(255,255,255,0.18) 100%)`,
              }}
            />
          </div>

          <div className="w-14 text-right font-mono text-xs text-foreground/60">
            -00:
            {Math.floor(100 - timelineValue)
              .toString()
              .padStart(2, "0")}
          </div>
        </div>

        <div className="mt-3 text-xs">
          {bypassDetected ? (
            <motion.p
              animate={{ opacity: [0.55, 1, 0.55] }}
              transition={{ duration: 1.1, repeat: Infinity }}
              className="text-danger"
            >
              Control bypass pattern detected. Replay chain and inspect evidence.
            </motion.p>
          ) : (
            <p className="text-emerald-300">No bypass pathway in the current timeline snapshot.</p>
          )}
        </div>
      </div>

      {cases.length ? (
        <div className="pointer-events-auto flex gap-2 overflow-x-auto pb-1">
          {cases.slice(0, 6).map((caseItem) => (
            <button
              key={caseItem.case_id}
              onClick={() => {
                void openInvestigation(caseItem.case_id);
              }}
              className={`glass-deep whitespace-nowrap rounded-full border px-3 py-1.5 text-xs ${
                activeCaseId === caseItem.case_id ? "border-primary/70 text-primary" : "border-border/70 text-foreground/75"
              }`}
            >
              {caseItem.case_id} | {caseItem.risk_level}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

