"use client";

import { Download } from "lucide-react";
import { useDashboardStore } from "@/store/dashboard-store";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

function average(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function median(values: number[]): number {
  if (!values.length) {
    return 0;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[middle - 1] + sorted[middle]) / 2;
  }
  return sorted[middle];
}

function downloadTextFile(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function ExportReportButton({ className }: { className?: string }) {
  const role = useDashboardStore((state) => state.role);
  const userName = useDashboardStore((state) => state.userName);
  const systemState = useDashboardStore((state) => state.systemState);
  const metrics = useDashboardStore((state) => state.metrics);
  const cases = useDashboardStore((state) => state.cases);
  const activeCaseId = useDashboardStore((state) => state.activeCaseId);
  const investigation = useDashboardStore((state) => state.investigation);

  const handleExport = () => {
    const nowIso = new Date().toISOString();
    const safeDate = nowIso.replaceAll(":", "-").replaceAll(".", "-");
    const reportId = `DFDT-${safeDate}`;

    const confidenceValues = cases.map((item) => Number(item.confidence) || 0);
    const avgConfidence = average(confidenceValues);
    const medianConfidence = median(confidenceValues);
    const totalExposure = cases.reduce((sum, item) => sum + (Number(item.transaction_amount) || 0), 0);
    const avgActors = average(cases.map((item) => item.actors_involved.length));
    const avgPathNodes = average(cases.map((item) => item.path_nodes.length));
    const escalatedCount = cases.filter((item) => item.status === "escalated").length;
    const falsePositiveCount = cases.filter((item) => item.status === "false_positive").length;

    const riskDistribution = {
      LOW: cases.filter((item) => item.risk_level === "LOW").length,
      MEDIUM: cases.filter((item) => item.risk_level === "MEDIUM").length,
      HIGH: cases.filter((item) => item.risk_level === "HIGH").length,
      CRITICAL: cases.filter((item) => item.risk_level === "CRITICAL").length,
    };

    const ruleFrequency = new Map<string, number>();
    for (const item of cases) {
      for (const ruleId of item.rules_triggered) {
        ruleFrequency.set(ruleId, (ruleFrequency.get(ruleId) ?? 0) + 1);
      }
    }
    const topRules = [...ruleFrequency.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);

    const activeCase = cases.find((item) => item.case_id === activeCaseId) ?? cases[0] ?? null;
    const recentEvents = (metrics?.recent_events ?? []).slice(-30);
    const agentAnalysis = investigation?.agent_analysis ?? null;

    const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Compliance Evidence Report</title>
  <style>
    body { font-family: Inter, Arial, sans-serif; margin: 28px; color: #111827; }
    h1, h2, h3 { margin: 0 0 10px; }
    h1 { font-size: 28px; }
    h2 { font-size: 18px; margin-top: 24px; }
    h3 { font-size: 14px; margin-top: 16px; text-transform: uppercase; letter-spacing: 0.08em; color: #374151; }
    p { margin: 6px 0; line-height: 1.5; }
    table { border-collapse: collapse; width: 100%; margin-top: 8px; }
    th, td { border: 1px solid #d1d5db; padding: 6px 8px; text-align: left; font-size: 12px; vertical-align: top; }
    th { background: #f3f4f6; }
    .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
    .card { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; background: #f9fafb; }
    ul { margin: 8px 0 0 18px; padding: 0; }
    li { margin-bottom: 4px; font-size: 12px; }
    .muted { color: #4b5563; font-size: 12px; }
  </style>
</head>
<body>
  <h1>Decision & Financial Digital Twin - Compliance Evidence Report</h1>
  <p class="muted">Report ID: ${escapeHtml(reportId)}</p>
  <p class="muted">Generated At: ${escapeHtml(nowIso)}</p>
  <p class="muted">Generated By: ${escapeHtml(userName ?? "Unknown User")} (${escapeHtml(role ?? "unknown")})</p>

  <h2>1. System Telemetry</h2>
  <div class="grid">
    <div class="card"><strong>Events Processed</strong><p>${systemState?.events_processed ?? 0}</p></div>
    <div class="card"><strong>Rules Triggered</strong><p>${systemState?.rules_triggered ?? 0}</p></div>
    <div class="card"><strong>Graph Nodes</strong><p>${systemState?.nodes_created ?? 0}</p></div>
    <div class="card"><strong>Active Cases</strong><p>${cases.length}</p></div>
    <div class="card"><strong>Escalated Cases</strong><p>${escalatedCount}</p></div>
    <div class="card"><strong>False Positives</strong><p>${falsePositiveCount}</p></div>
  </div>

  <h2>2. Precision Analytics</h2>
  <div class="grid">
    <div class="card"><strong>Average Confidence</strong><p>${avgConfidence.toFixed(2)}%</p></div>
    <div class="card"><strong>Median Confidence</strong><p>${medianConfidence.toFixed(2)}%</p></div>
    <div class="card"><strong>Total Exposure</strong><p>${formatCurrency(totalExposure)}</p></div>
    <div class="card"><strong>Avg Actors / Case</strong><p>${avgActors.toFixed(2)}</p></div>
    <div class="card"><strong>Avg Path Nodes / Case</strong><p>${avgPathNodes.toFixed(2)}</p></div>
    <div class="card"><strong>Critical Cases</strong><p>${riskDistribution.CRITICAL}</p></div>
  </div>

  <h3>Risk Distribution</h3>
  <table>
    <thead><tr><th>Level</th><th>Count</th></tr></thead>
    <tbody>
      <tr><td>LOW</td><td>${riskDistribution.LOW}</td></tr>
      <tr><td>MEDIUM</td><td>${riskDistribution.MEDIUM}</td></tr>
      <tr><td>HIGH</td><td>${riskDistribution.HIGH}</td></tr>
      <tr><td>CRITICAL</td><td>${riskDistribution.CRITICAL}</td></tr>
    </tbody>
  </table>

  <h3>Top Triggered Rules</h3>
  <table>
    <thead><tr><th>Rule ID</th><th>Frequency</th></tr></thead>
    <tbody>
      ${topRules.map(([ruleId, count]) => `<tr><td>${escapeHtml(ruleId)}</td><td>${count}</td></tr>`).join("") || "<tr><td colspan='2'>No rules triggered</td></tr>"}
    </tbody>
  </table>

  <h2>3. Case Evidence Matrix</h2>
  <table>
    <thead>
      <tr>
        <th>Case</th>
        <th>Risk</th>
        <th>Confidence</th>
        <th>Exposure</th>
        <th>Actors</th>
        <th>Rules</th>
        <th>Status</th>
        <th>Created At</th>
      </tr>
    </thead>
    <tbody>
      ${cases
        .map(
          (item) => `<tr>
          <td>${escapeHtml(item.case_id)}</td>
          <td>${escapeHtml(item.risk_level)}</td>
          <td>${Number(item.confidence).toFixed(2)}%</td>
          <td>${formatCurrency(Number(item.transaction_amount) || 0)}</td>
          <td>${escapeHtml(item.actors_involved.join(", "))}</td>
          <td>${escapeHtml(item.rules_triggered.join(", "))}</td>
          <td>${escapeHtml(item.status)}</td>
          <td>${escapeHtml(formatDate(item.created_at))}</td>
        </tr>`,
        )
        .join("") || "<tr><td colspan='8'>No cases available</td></tr>"}
    </tbody>
  </table>

  <h2>4. Investigation Narrative</h2>
  <p><strong>Active Case:</strong> ${escapeHtml(activeCase?.case_id ?? "N/A")}</p>
  <p><strong>Summary:</strong> ${escapeHtml(investigation?.summary ?? "No investigation summary available.")}</p>
  <h3>Event Sequence</h3>
  <ul>
    ${(investigation?.sequence_of_events ?? []).map((step) => `<li>${escapeHtml(step)}</li>`).join("") || "<li>No sequence available</li>"}
  </ul>
  <h3>Recommended Audit Actions</h3>
  <ul>
    ${(investigation?.recommended_audit_actions ?? []).map((step) => `<li>${escapeHtml(step)}</li>`).join("") || "<li>No recommendations available</li>"}
  </ul>

  <h2>5. Multi-Agent Review</h2>
  ${agentAnalysis ? `
  <p><strong>Mode:</strong> ${escapeHtml(agentAnalysis.mode)}</p>
  <p><strong>Providers Used:</strong> ${escapeHtml(agentAnalysis.consensus.providers_used.join(", ") || "local_secure_ai")}</p>
  <p><strong>Average Confidence:</strong> ${((agentAnalysis.consensus.average_confidence <= 1 ? agentAnalysis.consensus.average_confidence * 100 : agentAnalysis.consensus.average_confidence)).toFixed(1)}%</p>
  <p><strong>Conflict Score:</strong> ${((agentAnalysis.consensus.conflict_score <= 1 ? agentAnalysis.consensus.conflict_score * 100 : agentAnalysis.consensus.conflict_score)).toFixed(1)}%</p>
  <p><strong>Overall Risk:</strong> ${escapeHtml(agentAnalysis.consensus.overall_risk_level)}</p>
  <h3>Consensus Recommendations</h3>
  <ul>
    ${agentAnalysis.consensus.final_recommendations.map((item) => `<li>${escapeHtml(item)}</li>`).join("") || "<li>No consensus recommendations available</li>"}
  </ul>
  <h3>Agent Opinions</h3>
  <table>
    <thead><tr><th>Agent</th><th>Provider</th><th>Model</th><th>Confidence</th><th>Summary</th></tr></thead>
    <tbody>
      ${agentAnalysis.opinions.map((opinion) => `<tr>
        <td>${escapeHtml(opinion.agent_name)}</td>
        <td>${escapeHtml(opinion.provider)}</td>
        <td>${escapeHtml(opinion.model)}</td>
        <td>${((opinion.confidence <= 1 ? opinion.confidence * 100 : opinion.confidence)).toFixed(1)}%</td>
        <td>${escapeHtml(opinion.summary)}</td>
      </tr>`).join("")}
    </tbody>
  </table>
  ` : "<p>No multi-agent review was attached to the current investigation.</p>"}

  <h2>6. Recent Event Trace</h2>
  <table>
    <thead><tr><th>Timestamp</th><th>Actor</th><th>Event Type</th></tr></thead>
    <tbody>
      ${recentEvents
        .map(
          (event) =>
            `<tr><td>${escapeHtml(formatDate(event.timestamp))}</td><td>${escapeHtml(event.actor)}</td><td>${escapeHtml(
              event.event_type,
            )}</td></tr>`,
        )
        .join("") || "<tr><td colspan='3'>No recent events available</td></tr>"}
    </tbody>
  </table>

  <h2>7. Graph Legend</h2>
  <ul>
    <li>Blue nodes: Employees / Decisions</li>
    <li>Cyan nodes: Vendors / Rules</li>
    <li>Yellow nodes: Invoices</li>
    <li>Purple nodes: Payments</li>
    <li>Red nodes: Risk-critical entities</li>
    <li>Dashed line: Active risk pathway</li>
    <li>Green line: Node-focused relationship path</li>
    <li>Gray line: Standard relation edge</li>
  </ul>
</body>
</html>`;

    downloadTextFile(`compliance-evidence-${safeDate}.html`, html, "text/html");
  };

  return (
    <button
      onClick={handleExport}
      className={
        className ??
        "inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-panel px-3 py-1.5 text-xs font-medium text-foreground/90 transition hover:border-primary/45 hover:text-foreground"
      }
    >
      <span className="inline-flex items-center gap-1.5">
        <Download className="h-3.5 w-3.5" />
        Export Report
      </span>
    </button>
  );
}
