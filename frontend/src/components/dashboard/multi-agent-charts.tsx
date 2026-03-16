"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Activity, Bot, CheckCircle, Clock, TrendingUp, Zap, BarChart2, RefreshCcw
} from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";

interface AgentSample {
  ts: number; // unix ms
  events: number;
  rules: number;
  cases: number;
  latencyMs: number;
}

interface AgentBarData {
  label: string;
  value: number;
  peak: number;
  color: string;
}

function Sparkline({
  data,
  color,
  height = 48,
}: {
  data: number[];
  color: string;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const W = 200, H = height;
  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 4) - 2;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const area = `M${points[0]} L${points.join(" L")} L${W},${H} L0,${H} Z`;
  const line = `M${points.join(" L")}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height={H} style={{ display: "block" }}>
      <defs>
        <linearGradient id={`sg-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#sg-${color.replace("#", "")})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={points[points.length - 1].split(",")[0]} cy={points[points.length - 1].split(",")[1]}
        r="3.5" fill={color} stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

function BarGauge({ label, value, peak, color }: AgentBarData) {
  const pct = Math.min(100, (value / Math.max(peak, 1)) * 100);
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold text-[var(--foreground)]">{label}</span>
        <span className="text-[11px] font-bold" style={{ color }}>{value}</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--background)]">
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

export function MultiAgentCharts() {
  const systemState = useDashboardStore(s => s.systemState);
  const cases = useDashboardStore(s => s.cases);
  const ruleResults = useDashboardStore(s => s.ruleResults);
  const refreshPipeline = useDashboardStore(s => s.refreshPipeline);

  // Rolling history — max 30 samples
  const [history, setHistory] = useState<AgentSample[]>([]);
  const tickRef = useRef(0);

  const snapshot = useCallback((): AgentSample => ({
    ts: Date.now(),
    events: systemState?.events_processed ?? 0,
    rules: systemState?.rules_triggered ?? 0,
    cases: cases.length,
    latencyMs: tickRef.current * 3 + Math.round(Math.random() * 40), // simulated latency
  }), [systemState, cases.length]);

  // Collect a sample every 5s
  useEffect(() => {
    const id = setInterval(() => {
      tickRef.current += 1;
      setHistory(h => [...h.slice(-29), snapshot()]);
    }, 5000);
    // immediate first sample
    setHistory([snapshot()]);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Also update whenever upstream store refreshes
  useEffect(() => {
    setHistory(h => [...h.slice(-29), snapshot()]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemState?.events_processed, cases.length]);

  // Auto-refresh every 20s
  useEffect(() => {
    const id = setInterval(() => void refreshPipeline(), 20000);
    return () => clearInterval(id);
  }, [refreshPipeline]);

  const eventsData = history.map(s => s.events);
  const rulesData  = history.map(s => s.rules);
  const casesData  = history.map(s => s.cases);
  const latData    = history.map(s => s.latencyMs);

  const latestEvents = eventsData[eventsData.length - 1] ?? 0;
  const latestRules  = rulesData[rulesData.length - 1] ?? 0;
  const latestCases  = casesData[casesData.length - 1] ?? 0;
  const latestLat    = latData[latData.length - 1] ?? 0;
  const latestNodes  = systemState?.nodes_created ?? 0;

  const ruleTriggeredCount = ruleResults.length;

  // Agent table rows (simulated agent activity from real data)
  const agentRows = [
    { agent: "ComplianceEngine",  runs: systemState?.rules_triggered ?? 0, lastRun: "live", status: "active",  color: "#6c5ce7" },
    { agent: "RiskScorer",        runs: cases.length,                       lastRun: "live", status: "active",  color: "#e74c3c" },
    { agent: "PathwayDetector",   runs: systemState?.nodes_created ?? 0,    lastRun: "live", status: "active",  color: "#00b894" },
    { agent: "AuditorGuard",      runs: (cases.length * 2),                   lastRun: "live", status: "standby", color: "#0984e3" },
    { agent: "AnomalyGuard",      runs: Math.floor(cases.length * 0.7),     lastRun: "live", status: "active",  color: "#f39c12" },
    { agent: "ExplanationEngine", runs: ruleTriggeredCount,                  lastRun: "live", status: cases.length > 0 ? "active" : "idle", color: "#00cec9" },
  ];

  const KPI = [
    { label: "Events",     value: latestEvents, color: "#6c5ce7", icon: Activity,   sparkData: eventsData },
    { label: "Rules",      value: latestRules,  color: "#00b894", icon: CheckCircle, sparkData: rulesData },
    { label: "Cases",      value: latestCases,  color: "#e74c3c", icon: TrendingUp,  sparkData: casesData },
    { label: "Latency ms", value: latestLat,    color: "#f39c12", icon: Clock,       sparkData: latData },
  ];

  return (
    <div className="space-y-6">
      {/* KPI sparkline cards */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <BarChart2 className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-bold">Realtime Metrics</h3>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold text-[#00b894]">
            <span className="h-2 w-2 rounded-full bg-[#00b894] animate-pulse" /> LIVE
          </span>
        </div>
        <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
          {KPI.map(k => {
            const Icon = k.icon;
            return (
              <div key={k.label} className="neo-card overflow-hidden p-4">
                <div className="mb-2 flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">{k.label}</p>
                    <p className="mt-1 text-2xl font-bold" style={{ color: k.color }}>{k.value.toLocaleString()}</p>
                  </div>
                  <div className="rounded-xl p-2" style={{ background: `${k.color}15` }}>
                    <Icon className="h-4 w-4" style={{ color: k.color }} />
                  </div>
                </div>
                <div className="h-12 w-full">
                  <Sparkline data={k.sparkData} color={k.color} height={48} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bar gauges — relative load */}
      <div className="neo-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-bold">Agent Load (relative)</h3>
        </div>
        <div className="space-y-3.5">
          {[
            { label: "Events Processed",  value: latestEvents,  peak: Math.max(...eventsData, 1), color: "#6c5ce7" },
            { label: "Rules Triggered",   value: latestRules,   peak: Math.max(...rulesData, 1),  color: "#00b894" },
            { label: "Active Cases",      value: latestCases,   peak: Math.max(...casesData, 1),  color: "#e74c3c" },
            { label: "Graph Nodes",       value: latestNodes,   peak: Math.max(latestNodes, 1),   color: "#f39c12" },
          ].map(bar => (
            <BarGauge key={bar.label} {...bar} />
          ))}
        </div>
      </div>

      {/* Agent activity table */}
      <div className="neo-card p-5">
        <div className="mb-4 flex items-center gap-2">
          <Bot className="h-4 w-4 text-[var(--primary)]" />
          <h3 className="text-sm font-bold">Agent Activity</h3>
          <button onClick={() => void refreshPipeline()}
            className="ml-auto flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10px] font-semibold hover:bg-[var(--background)] text-[var(--text-muted)] transition-colors">
            <RefreshCcw className="h-3 w-3" /> Refresh
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-[var(--card-border)] text-[10px] font-bold uppercase tracking-wider text-[var(--text-muted)]">
                <th className="pb-2.5 pr-4">Agent</th>
                <th className="pb-2.5 pr-4">Runs / Events</th>
                <th className="pb-2.5 pr-4">Status</th>
                <th className="pb-2.5">Activity</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--card-border)]">
              {agentRows.map(row => (
                <tr key={row.agent} className="hover:bg-[var(--background)] transition-colors">
                  <td className="py-2.5 pr-4">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ background: row.color }} />
                      <span className="font-semibold">{row.agent}</span>
                    </div>
                  </td>
                  <td className="py-2.5 pr-4 font-mono font-bold" style={{ color: row.color }}>
                    {row.runs.toLocaleString()}
                  </td>
                  <td className="py-2.5 pr-4">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      row.status === "active"  ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                      row.status === "standby" ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                      "bg-[var(--background)] text-[var(--text-muted)]"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${
                        row.status === "active"  ? "bg-green-500 animate-pulse" :
                        row.status === "standby" ? "bg-blue-500" : "bg-gray-400"
                      }`} />
                      {row.status}
                    </span>
                  </td>
                  <td className="py-2.5">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--background)]">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ background: row.color }}
                        animate={{ width: [`${20 + Math.random() * 40}%`, `${50 + Math.random() * 40}%`, `${20 + Math.random() * 40}%`] }}
                        transition={{ duration: 3 + Math.random() * 2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
