"use client";

import { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { useTheme } from "next-themes";
import { getReportDraft, saveReportDraft } from "@/lib/api";
import { useDashboardStore } from "@/store/dashboard-store";
import {
  Bold, Italic, Underline, Strikethrough,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Link2, Download, FileText, Sparkles, Table as TableIcon,
  CheckCircle2, Heading1, Heading2, Heading3, Undo, Redo, FileDown,
  Type
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

const REPORT_FONT_STACK = "'Times New Roman', Times, serif";

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeReportHtml(html: string): string {
  if (!html.trim()) {
    return html;
  }

  return html
    .replace(/font-family\s*:\s*[^;]+/gi, `font-family: ${REPORT_FONT_STACK}`)
    .replace(
      /color\s*:\s*(#fff(?:fff)?|white|#f8fafc|#f1f5f9|#e2e8f0|rgb\(255,\s*255,\s*255\)|rgb\(248,\s*250,\s*252\)|rgb\(241,\s*245,\s*249\)|rgb\(226,\s*232,\s*240\))/gi,
      "color: #111827",
    )
    .replace(
      /background(?:-color)?\s*:\s*(#0b1020|#0f172a|#111827|black|rgb\(11,\s*16,\s*32\)|rgb\(15,\s*23,\s*42\)|rgb\(17,\s*24,\s*39\))/gi,
      "background-color: transparent",
    );
}

// ---------------------------------------------------------------------------
// Toolbar button helper
// ---------------------------------------------------------------------------
function TBtn({
  title,
  onClick,
  children,
  active,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => {
        e.preventDefault(); // don't steal focus from editor
        onClick();
      }}
      className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors text-[var(--text-muted)] hover:bg-[var(--primary)]/10 hover:text-[var(--primary)] ${
        active ? "bg-[var(--primary)]/15 text-[var(--primary)]" : ""
      }`}
    >
      {children}
    </button>
  );
}

function TDivider() {
  return <span className="mx-1 h-5 w-px bg-[var(--border)]" />;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export function AuditorReportWriter() {
  const cases = useDashboardStore((state) => state.cases);
  const setReportContent = useDashboardStore((state) => state.setReportContent);
  const token = useDashboardStore((state) => state.token);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== "light";

  const editorRef = useRef<HTMLDivElement>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);

  const [isExporting, setIsExporting] = useState(false);
  const [saveIndicator, setSaveIndicator] = useState<"Saved" | "Saving..." | "Local backup saved">("Saved");
  const [isMounted, setIsMounted] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSavedBy, setLastSavedBy] = useState<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveSequence = useRef(0);
  const panelSurfaceClass = isDark ? "bg-[#121a31]" : "bg-[var(--card-bg)]";
  const mutedSurfaceClass = isDark ? "bg-[#0d1529]" : "bg-[var(--background)]";
  const sidebarCardClass = isDark ? "border-[#24314a] bg-[#0f172a]" : "border-[var(--card-border)] bg-[var(--background)]";
  const paperStageStyle = isDark
    ? {
        background:
          "radial-gradient(circle at top, rgba(162, 155, 254, 0.18), transparent 32%), linear-gradient(180deg, #141b31 0%, #0c1224 100%)",
      }
    : {
        background: "linear-gradient(180deg, #f8faff 0%, #eef2ff 100%)",
      };
  const accentCardStyle = isDark
    ? {
        background: "linear-gradient(180deg, rgba(162, 155, 254, 0.16), rgba(15, 23, 42, 0.96))",
        borderColor: "rgba(162, 155, 254, 0.28)",
      }
    : undefined;

  const userName = useDashboardStore((state) => state.userName) || "Authorized Auditor";
  const getPrecisionTemplate = useCallback(() => {
    const today = new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase();
    const id = Math.random().toString(36).substring(2, 8).toUpperCase();
    
    return `
<div style="font-family: ${REPORT_FONT_STACK}; color: #111827; line-height: 1.75; width: 100%; max-width: 760px; margin: 0 auto;">
  <p style="margin: 0; font-size: 11px; letter-spacing: 0.24em; text-transform: uppercase; color: #475569;">Official Compliance Record</p>
  <h1 style="margin: 10px 0 6px; font-size: 26px; font-weight: 700; letter-spacing: 0.03em; color: #111827; text-transform: uppercase;">Digital Twin Audit Report</h1>
  <p style="margin: 0 0 18px; font-size: 12px; color: #475569;">Prepared for formal governance review, audit committee circulation, and compliance evidence retention.</p>
  <div style="border-top: 2px solid #0f172a; border-bottom: 1px solid #cbd5e1; padding: 14px 0 16px; margin-bottom: 26px;">
    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
    <tr>
      <td style="padding: 6px 0; font-weight: 700; width: 24%; color: #334155;">Audit Date</td>
      <td style="padding: 6px 12px 6px 0;">${today}</td>
      <td style="padding: 6px 0; font-weight: 700; width: 24%; color: #334155;">Report ID</td>
      <td style="padding: 6px 0;">AR-${id}</td>
    </tr>
    <tr>
      <td style="padding: 6px 0; font-weight: 700; color: #334155;">Auditor Name</td>
      <td style="padding: 6px 12px 6px 0;">${userName}</td>
      <td style="padding: 6px 0; font-weight: 700; color: #334155;">Review Period</td>
      <td style="padding: 6px 0;">Last 30 Days</td>
    </tr>
    </table>
  </div>

  <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #111827;">1. Executive Summary</h2>
  <p style="margin: 0 0 8px; font-size: 13px; color: #475569; font-style: italic;">Provide a concise summary of scope, material observations, and recommended governance action.</p>
  <p style="font-size: 15px; margin: 0 0 18px;">[Enter Executive Summary Here]</p>

  <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #111827;">2. Key Findings and Anomalies</h2>
  <p style="margin: 0 0 8px; font-size: 13px; color: #475569; font-style: italic;">Describe material pathways, policy breaches, and unusual control outcomes surfaced by the decision intelligence engine.</p>
  <ul style="font-size: 15px; margin: 0 0 18px; padding-left: 22px;">
    <li><strong>Finding 1:</strong> [Description of anomaly e.g., Multi-tier approval bypass detected...]</li>
    <li><strong>Finding 2:</strong> [Description of anomaly]</li>
  </ul>

  <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #111827;">3. Financial Exposure Analysis</h2>
  <p style="margin: 0 0 8px; font-size: 13px; color: #475569; font-style: italic;">Summarize the total financial risk. Use the embedded data-table action to insert current case evidence below.</p>
  <p style="font-size: 15px; margin: 0 0 18px;">[Review embedded data tables for detailed transaction analysis]</p>

  <h2 style="margin: 0 0 8px; font-size: 18px; font-weight: 700; color: #111827;">4. Auditor Viewpoints and Recommendations</h2>
  <p style="margin: 0 0 8px; font-size: 13px; color: #475569; font-style: italic;">Provide professional judgement on systemic issues, control gaps, and required remediation actions.</p>
  <ol style="font-size: 15px; margin: 0 0 24px; padding-left: 22px;">
    <li>[Recommendation 1]</li>
    <li>[Recommendation 2]</li>
  </ol>

  <table style="width: 100%; margin-top: 28px; font-size: 13px; border-top: 1px solid #cbd5e1; padding-top: 16px;">
    <tr>
      <td style="width: 50%; vertical-align: top;">
        <p style="font-weight: 700; margin: 0 0 4px 0;">Generated by system</p>
        <p style="color: #475569; margin: 0;">Decision Digital Twin</p>
        <p style="color: #475569; margin: 0;">Compliance & Governance Engine V1.1</p>
      </td>
      <td style="width: 50%; text-align: right; vertical-align: bottom;">
        <p style="font-weight: 700; margin: 0 0 10px 0;">Auditor acknowledgement</p>
        <div style="border-bottom: 1px solid #111827; width: 220px; margin-left: auto; height: 30px; position: relative;">
          <span style="font-family: ${REPORT_FONT_STACK}; font-size: 18px; color: #111827; position: absolute; bottom: 2px; right: 0; font-style: italic;">${userName}</span>
        </div>
        <p style="font-size: 11px; margin-top: 6px; color: #475569;">Date: ${today}</p>
      </td>
    </tr>
  </table>
</div>
`;
  }, [userName]);

  // NOTE: intentionally NOT using reportContent from the store here.
  // Including it would cause this effect to re-run on every keystroke
  // (reportContent updates via handleInput → setReportContent), which would
  // re-fetch from the server and overwrite unsaved edits. The initial content
  // is computed once from localStorage / the server / the template.
  useEffect(() => {
    let cancelled = false;

    const initializeDraft = async () => {
      const localBackup = typeof window === "undefined" ? "" : localStorage.getItem("auditor_report_draft") ?? "";
      // Compute fallback directly — not from reactive state — so this effect
      // only fires when `token` changes (login / logout), never on keystrokes.
      let initial = localBackup || getPrecisionTemplate();

      if (token) {
        try {
          const draft = await getReportDraft(token);
          if (draft.content.trim()) {
            initial = draft.content;
          }
          if (!cancelled) {
            setLastSavedAt(draft.updated_at);
            setLastSavedBy(draft.updated_by);
            setSaveIndicator(draft.content.trim() ? "Saved" : localBackup ? "Local backup saved" : "Saved");
          }
        } catch {
          if (!cancelled) {
            setSaveIndicator(localBackup ? "Local backup saved" : "Saved");
          }
        }
      } else if (!cancelled) {
        setSaveIndicator(localBackup ? "Local backup saved" : "Saved");
      }

      initial = normalizeReportHtml(initial);

      if (cancelled) {
        return;
      }

      if (editorRef.current && editorRef.current.innerHTML !== initial) {
        editorRef.current.innerHTML = initial;
      }
      setReportContent(initial);
      setIsMounted(true);
    };

    void initializeDraft();

    return () => {
      cancelled = true;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const persistDraft = useCallback(
    async (html: string, seq: number) => {
      localStorage.setItem("auditor_report_draft", html);

      if (!token) {
        if (seq === saveSequence.current) {
          setSaveIndicator("Local backup saved");
        }
        return;
      }

      try {
        const draft = await saveReportDraft(token, { content: html });
        if (seq === saveSequence.current) {
          setLastSavedAt(draft.updated_at);
          setLastSavedBy(draft.updated_by);
          setSaveIndicator("Saved");
        }
      } catch {
        if (seq === saveSequence.current) {
          setSaveIndicator("Local backup saved");
        }
      }
    },
    [token],
  );

  const saveSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.rangeCount === 0) {
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      return;
    }

    savedSelectionRef.current = range.cloneRange();
  }, []);

  const moveCaretToEnd = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) {
      return null;
    }

    const range = document.createRange();
    range.selectNodeContents(editor);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
    savedSelectionRef.current = range.cloneRange();
    return range;
  }, []);

  const placeCaretInNode = useCallback((node: Node, collapseToEnd = true) => {
    const selection = window.getSelection();
    if (!selection) {
      return;
    }

    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(collapseToEnd);
    selection.removeAllRanges();
    selection.addRange(range);
    savedSelectionRef.current = range.cloneRange();
  }, []);

  const placeCaretAfterNode = useCallback((node: Node) => {
    const selection = window.getSelection();
    if (!selection || !node.parentNode) {
      return;
    }

    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    savedSelectionRef.current = range.cloneRange();
  }, []);

  const restoreSelection = useCallback(() => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection) {
      return false;
    }

    editor.focus({ preventScroll: true });

    const savedRange = savedSelectionRef.current;
    if (savedRange && editor.contains(savedRange.commonAncestorContainer)) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
      return true;
    }

    return Boolean(moveCaretToEnd());
  }, [moveCaretToEnd]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    setReportContent(html);
    saveSelection();

    setSaveIndicator("Saving...");
    saveSequence.current += 1;
    const seq = saveSequence.current;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void persistDraft(html, seq);
    }, 800);
  }, [persistDraft, saveSelection, setReportContent]);

  useEffect(() => {
    const handleSelectionChange = () => {
      const editor = editorRef.current;
      const selection = window.getSelection();
      if (!editor || !selection || selection.rangeCount === 0) {
        return;
      }
      const range = selection.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedSelectionRef.current = range.cloneRange();
      }
    };

    document.addEventListener("selectionchange", handleSelectionChange);
    return () => document.removeEventListener("selectionchange", handleSelectionChange);
  }, []);

  const lastSavedLabel = useMemo(() => {
    if (!lastSavedAt) {
      return null;
    }
    return new Date(lastSavedAt).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  }, [lastSavedAt]);

  // ---------------------------------------------------------------------------
  // Insert helpers and formatting commands
  // ---------------------------------------------------------------------------
  const insertHtmlAtSelection = useCallback((html: string) => {
    const editor = editorRef.current;
    if (!editor || !restoreSelection()) return;

    let selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      moveCaretToEnd();
      selection = window.getSelection();
    }

    if (!selection || selection.rangeCount === 0) {
      return;
    }

    let range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) {
      moveCaretToEnd();
      selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) {
        return;
      }
      range = selection.getRangeAt(0);
    }

    range.deleteContents();

    const container = document.createElement("div");
    container.innerHTML = html.trim();
    const fragment = document.createDocumentFragment();
    let lastNode: ChildNode | null = null;
    while (container.firstChild) {
      lastNode = fragment.appendChild(container.firstChild);
    }

    if (!lastNode) {
      return;
    }

    range.insertNode(fragment);
    placeCaretAfterNode(lastNode);
    handleInput();
  }, [handleInput, moveCaretToEnd, placeCaretAfterNode, restoreSelection]);

  const wrapSelectionWithInlineTag = useCallback((tag: "strong" | "em" | "u" | "s") => {
    const editor = editorRef.current;
    if (!editor || !restoreSelection()) {
      return false;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return false;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer) || range.collapsed) {
      return false;
    }

    const wrapper = document.createElement(tag);
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);
    placeCaretAfterNode(wrapper);
    handleInput();
    return true;
  }, [handleInput, placeCaretAfterNode, restoreSelection]);

  const exec = useCallback((cmd: string, value?: string) => {
    if (!restoreSelection()) return;

    if (cmd === "foreColor") {
      document.execCommand("styleWithCSS", false, "true");
    }

    let succeeded = false;
    try {
      succeeded = document.execCommand(cmd, false, value ?? "");
    } catch {
      succeeded = false;
    }

    if (!succeeded) {
      const fallbackInlineTag =
        cmd === "bold"
          ? "strong"
          : cmd === "italic"
            ? "em"
            : cmd === "underline"
              ? "u"
              : cmd === "strikeThrough"
                ? "s"
                : null;

      if (fallbackInlineTag && wrapSelectionWithInlineTag(fallbackInlineTag)) {
        return;
      }
    }

    saveSelection();
    handleInput();
  }, [handleInput, restoreSelection, saveSelection, wrapSelectionWithInlineTag]);

  const insertHeading = useCallback((tag: "h1" | "h2" | "h3" | "p") => {
    const editor = editorRef.current;
    if (!editor || !restoreSelection()) {
      return;
    }

    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) {
      insertHtmlAtSelection(tag === "p" ? "<p>Start writing here...</p>" : `<${tag}>Section heading</${tag}><p><br></p>`);
      return;
    }

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer) || range.collapsed) {
      insertHtmlAtSelection(tag === "p" ? "<p>Start writing here...</p>" : `<${tag}>Section heading</${tag}><p><br></p>`);
      return;
    }

    const wrapper = document.createElement(tag);
    wrapper.appendChild(range.extractContents());
    range.insertNode(wrapper);

    const nextParagraph = document.createElement("p");
    nextParagraph.innerHTML = "<br>";
    wrapper.after(nextParagraph);
    placeCaretInNode(nextParagraph, false);
    handleInput();
  }, [handleInput, insertHtmlAtSelection, placeCaretInNode, restoreSelection]);

  const insertLink = useCallback(() => {
    saveSelection();
    const url = window.prompt("Enter URL:", "https://");
    if (url) exec("createLink", url);
  }, [exec, saveSelection]);

  const insertColor = useCallback(() => {
    saveSelection();
    const color = window.prompt("Enter text color (hex or name):", "#111827");
    if (color) exec("foreColor", color);
  }, [exec, saveSelection]);

  // ---------------------------------------------------------------------------
  // AI Suggestions from live case data
  // ---------------------------------------------------------------------------
  const suggestions = useMemo(() => {
    const rules = new Set<string>();
    let exposure = 0;
    cases.forEach((c) => {
      c.rules_triggered.forEach((r) => rules.add(r));
      exposure += Number(c.transaction_amount) || 0;
    });
    const out: string[] = [];
    if (rules.size > 0) {
      out.push(`${rules.size} unique policy violations found: ${[...rules].slice(0, 2).join(", ")}.`);
    }
    if (exposure > 0) {
      out.push(`Total financial exposure: ₹${exposure.toLocaleString("en-IN")}. Immediate remediation required.`);
    }
    if (cases.some((c) => c.risk_level === "CRITICAL")) {
      out.push("CRITICAL: Multi-tier vendor approval bypass detected. Recommend freeze on affected accounts.");
    }
    if (cases.some((c) => c.risk_level === "HIGH")) {
      out.push("HIGH: Cases require audit sign-off within 48 hours per governance policy.");
    }
    return out.length ? out : ["No significant anomalies detected in the current audit window."];
  }, [cases]);

  const insertSuggestion = useCallback((text: string) => {
    insertHtmlAtSelection(`<p>${escapeHtml(text)}</p><p><br></p>`);
  }, [insertHtmlAtSelection]);

  // ---------------------------------------------------------------------------
  // Embed graph data table
  // ---------------------------------------------------------------------------
  const insertDataTable = useCallback(() => {
    const highRisk = cases.filter((c) => c.risk_level === "CRITICAL" || c.risk_level === "HIGH");
    const totalExposure = highRisk.reduce((sum, c) => sum + (Number(c.transaction_amount) || 0), 0);
    const criticalCases = highRisk.filter((c) => c.risk_level === "CRITICAL").length;
    const rows = highRisk.slice(0, 5).map((c) => `
      <tr>
        <td style="padding:8px;border:1px solid #ddd">${escapeHtml(c.case_id)}</td>
        <td style="padding:8px;border:1px solid #ddd;color:${c.risk_level === "CRITICAL" ? "#e74c3c" : "#f39c12"};font-weight:700">${c.risk_level}</td>
        <td style="padding:8px;border:1px solid #ddd">₹${(Number(c.transaction_amount) || 0).toLocaleString("en-IN")}</td>
        <td style="padding:8px;border:1px solid #ddd">${escapeHtml(c.rules_triggered.slice(0, 2).join(", ") || "—")}</td>
      </tr>`).join("");

    const table = `<section style="margin:16px 0; border:1px solid #dbe4f0; border-radius:16px; padding:16px; background:#ffffff;">
<p style="margin:0 0 6px; font-size:12px; letter-spacing:0.16em; text-transform:uppercase; color:#64748b;">Live graph evidence snapshot</p>
<p style="margin:0 0 12px; font-size:13px; color:#334155;">${highRisk.length} high-risk cases in scope · ${criticalCases} critical · ₹${totalExposure.toLocaleString("en-IN")} exposure</p>
<table style="width:100%;border-collapse:collapse;margin:12px 0;font-size:13px">
  <thead>
    <tr style="background:#f8f8ff;text-align:left">
      <th style="padding:8px;border:1px solid #ddd">Case ID</th>
      <th style="padding:8px;border:1px solid #ddd">Risk</th>
      <th style="padding:8px;border:1px solid #ddd">Exposure (INR)</th>
      <th style="padding:8px;border:1px solid #ddd">Rules Triggered</th>
    </tr>
  </thead>
  <tbody>${rows || '<tr><td colspan="4" style="padding:8px;border:1px solid #ddd;text-align:center">No high-risk cases found</td></tr>'}</tbody>
</table>
<em style="font-size:11px;color:#64748b">Autogenerated from live Digital Twin Graph</em>
</section><p><br></p>`;

    insertHtmlAtSelection(table);
  }, [cases, insertHtmlAtSelection]);

  // ---------------------------------------------------------------------------
  // PDF Export
  // ---------------------------------------------------------------------------
  const exportPDF = useCallback(async () => {
    if (!exportRef.current) return;
    setIsExporting(true);
    try {
      const canvas = await html2canvas(exportRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const img = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const w = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(img, "PNG", 0, 0, w, h);
      let heightLeft = h - pageH;
      let position = -pageH;
      while (heightLeft > 0) {
        pdf.addPage();
        pdf.addImage(img, "PNG", 0, position, w, h);
        heightLeft -= pageH;
        position -= pageH;
      }
      pdf.save(`Audit_Report_${new Date().toISOString().slice(0, 10)}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
    } finally {
      setIsExporting(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Word Export
  // ---------------------------------------------------------------------------
  const exportWord = useCallback(() => {
    const content = normalizeReportHtml(editorRef.current?.innerHTML || "");
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset='utf-8'><title>Audit Report</title>
<style>
body{margin:18mm 16mm;font-family:${REPORT_FONT_STACK};font-size:12pt;color:#111827;line-height:1.75;background:#fff}
h1,h2,h3{color:#111827;font-family:${REPORT_FONT_STACK}}
h1{font-size:20pt;text-transform:uppercase;letter-spacing:.04em}
h2{font-size:14pt;margin-top:18pt}
h3{font-size:12pt;margin-top:14pt}
p,li{font-size:12pt;color:#111827}
table{border-collapse:collapse;width:100%}
td,th{border:1px solid #cbd5e1;padding:6pt;vertical-align:top}
th{background:#f8fafc;font-weight:700}
</style>
</head><body>${content}</body></html>`;
    const blob = new Blob(["\ufeff", html], { type: "application/msword" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Audit_Report_${new Date().toISOString().slice(0, 10)}.doc`;
    document.body.appendChild(a);
    a.click();
    URL.revokeObjectURL(url);
    a.remove();
  }, []);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  if (!isMounted) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--text-muted)] animate-pulse">
        Loading Report Writer...
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden xl:flex-row">
      {/* ── Editor Section ── */}
      <section className={`neo-card flex min-h-0 flex-1 flex-col overflow-hidden ${isDark ? "bg-[#11182b] shadow-[0_18px_42px_rgba(3,7,18,0.45)]" : ""}`}>
        {/* Header Bar */}
        <div className={`shrink-0 border-b border-[var(--card-border)] px-4 py-4 ${panelSurfaceClass}`}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="rounded-xl bg-[var(--primary)]/10 p-1.5">
                <FileText className="h-4 w-4 text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-sm font-bold leading-none">Investigation Report Writer</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Official white-paper writing surface with Times New Roman export formatting.
                </p>
                <div className="mt-1.5 flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                  <CheckCircle2 className="h-3 w-3 text-[#00b894]" />
                  {saveIndicator} · Auto-save enabled
                </div>
                {lastSavedLabel ? (
                  <p className="mt-1 text-[10px] text-[var(--text-muted)]">
                    Last sync {lastSavedLabel}{lastSavedBy ? ` by ${lastSavedBy}` : ""}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => {
                if (window.confirm("Overwrite current document with fresh blank template?")) {
                  if (editorRef.current) {
                    editorRef.current.innerHTML = getPrecisionTemplate();
                    handleInput();
                  }
                }
              }} className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--danger)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--danger)] hover:bg-[var(--danger)]/20 transition-colors">
                <Undo className="h-3.5 w-3.5" /> Reset Template
              </button>
              
              <button
                onMouseDown={(e) => { e.preventDefault(); insertDataTable(); }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--primary)]/30 bg-[var(--primary)]/5 px-3 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary)]/10 transition-colors"
              >
                <TableIcon className="h-3.5 w-3.5" /> Embed Graph Data
              </button>
              <button
                onClick={exportWord}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--card-border)] bg-[var(--card-bg)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--background)]"
              >
                <FileDown className="h-3.5 w-3.5" /> Export Word
              </button>
              <button
                onClick={exportPDF}
                disabled={isExporting}
                className="pro-button inline-flex items-center gap-1.5 disabled:opacity-60"
              >
                {isExporting ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                ) : (
                  <Download className="h-3.5 w-3.5" />
                )}
                {isExporting ? "Exporting..." : "Export PDF"}
              </button>
            </div>
          </div>
        </div>

        {/* Formatting Toolbar */}
        <div className={`shrink-0 border-b border-[var(--card-border)] px-3 py-2 ${mutedSurfaceClass}`}>
          <div className="flex flex-wrap items-center gap-0.5">
            <TBtn title="Undo" onClick={() => exec("undo")}><Undo className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Redo" onClick={() => exec("redo")}><Redo className="h-3.5 w-3.5" /></TBtn>
            <TDivider />
            <TBtn title="Heading 1" onClick={() => insertHeading("h1")}><Heading1 className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Heading 2" onClick={() => insertHeading("h2")}><Heading2 className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Heading 3" onClick={() => insertHeading("h3")}><Heading3 className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Paragraph" onClick={() => insertHeading("p")}><Type className="h-3.5 w-3.5" /></TBtn>
            <TDivider />
            <TBtn title="Bold" onClick={() => exec("bold")}><Bold className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Italic" onClick={() => exec("italic")}><Italic className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Underline" onClick={() => exec("underline")}><Underline className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Strikethrough" onClick={() => exec("strikeThrough")}><Strikethrough className="h-3.5 w-3.5" /></TBtn>
            <TDivider />
            <TBtn title="Bullet List" onClick={() => exec("insertUnorderedList")}><List className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Numbered List" onClick={() => exec("insertOrderedList")}><ListOrdered className="h-3.5 w-3.5" /></TBtn>
            <TDivider />
            <TBtn title="Align Left" onClick={() => exec("justifyLeft")}><AlignLeft className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Align Center" onClick={() => exec("justifyCenter")}><AlignCenter className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Align Right" onClick={() => exec("justifyRight")}><AlignRight className="h-3.5 w-3.5" /></TBtn>
            <TDivider />
            <TBtn title="Insert Link" onClick={insertLink}><Link2 className="h-3.5 w-3.5" /></TBtn>
            <TBtn title="Text Color" onClick={insertColor}>
              <span className="inline-block h-3.5 w-3.5 rounded-sm bg-[var(--primary)]" />
            </TBtn>
          </div>
        </div>

        <div className={`shrink-0 border-b border-[var(--card-border)] px-4 py-3 ${panelSurfaceClass}`}>
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">Quick inserts</span>
              <button
                onMouseDown={(e) => { e.preventDefault(); insertDataTable(); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--primary)]/25 bg-[var(--primary)]/6 px-3 py-1.5 text-[11px] font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/10"
              >
                <TableIcon className="h-3.5 w-3.5" /> Live graph evidence table
              </button>
              {suggestions.slice(0, 3).map((suggestion, index) => (
                <button
                  key={`quick-suggestion-${index}`}
                  title={suggestion}
                  onMouseDown={(e) => { e.preventDefault(); insertSuggestion(suggestion); }}
                  className="max-w-full rounded-full border border-[var(--card-border)] bg-[var(--background)] px-3 py-1.5 text-[11px] font-medium text-[var(--foreground)] transition-colors hover:border-[var(--primary)]/35 hover:bg-[var(--primary)]/6"
                >
                  <span className="block max-w-[260px] truncate">{suggestion}</span>
                </button>
              ))}
            </div>
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
              Inserts land at the current cursor position, or at the end of the report if the cursor was lost.
            </p>
          </div>
        </div>

        {/* Editor Canvas — dark outer container, white A4 paper inside */}
        <div className="flex-1 overflow-y-auto px-4 py-5 md:px-6" style={paperStageStyle}>
          {/* Editor styles */}
          <style>{`
            #rw-editor { outline: none; min-height: 100%; font-family: ${REPORT_FONT_STACK}; color: #111827; background: #ffffff; caret-color: #111827; }
            #rw-editor h1 { font-size: 1.7em; font-weight: 700; margin: 0.75em 0 0.4em; text-transform: uppercase; letter-spacing: 0.04em; }
            #rw-editor h2 { font-size: 1.3em; font-weight: 700; margin: 0.75em 0 0.4em; }
            #rw-editor h3 { font-size: 1.1em; font-weight: 700; margin: 0.6em 0 0.3em; }
            #rw-editor p  { margin: 0.4em 0; line-height: 1.8; }
            #rw-editor ul, #rw-editor ol { padding-left: 1.5em; margin: 0.5em 0; }
            #rw-editor li { margin: 0.2em 0; }
            #rw-editor a  { color: #6c5ce7; text-decoration: underline; }
            #rw-editor table { width: 100%; border-collapse: collapse; margin: 1em 0; font-size: 13px; }
            #rw-editor td, #rw-editor th { border: 1px solid #cbd5e1; padding: 6px 10px; color: #111827; }
            #rw-editor th { background: #f8fafc; font-weight: 700; }
          `}</style>
          <div className="mx-auto mb-3 flex max-w-[850px] items-center justify-between gap-3 rounded-full border border-white/10 bg-white/8 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)] backdrop-blur">
            <span>Export-safe white paper</span>
            <span>{isDark ? "Dark shell preview" : "Light shell preview"}</span>
          </div>
          <div ref={exportRef} className="mx-auto min-h-[1122px] w-full max-w-[850px] rounded-[28px] border border-[#d7dce5] bg-white shadow-[0_24px_70px_rgba(15,23,42,0.16)]">
            <div
              id="rw-editor"
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyUp={saveSelection}
              onBlur={saveSelection}
              onMouseUp={saveSelection}
              onFocus={saveSelection}
              className="min-h-[1122px] px-8 py-10 text-[15px] leading-7 text-[var(--foreground)] focus:outline-none md:px-[72px] md:py-[88px]"
              spellCheck
            />
          </div>
        </div>
      </section>

      {/* ── AI Suggestions Sidebar ── */}
      <section className={`neo-card flex max-h-[360px] min-h-[280px] w-full shrink-0 flex-col overflow-hidden xl:min-h-0 xl:max-h-none xl:w-80 ${isDark ? "bg-[#11182b]" : ""}`}>
        <div className={`shrink-0 border-b border-[var(--card-border)] px-4 py-3 ${panelSurfaceClass}`}>
          <p className="panel-title inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-[var(--accent)]" />
            Live Suggestions
          </p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--text-muted)]">Click any card to insert it directly into the report at the cursor or the document end.</p>
        </div>

        <div className={`custom-scrollbar flex-1 space-y-2.5 overflow-y-auto p-3 ${mutedSurfaceClass}`}>
          <div className="rounded-xl border p-3" style={accentCardStyle}>
            <p className="text-[11px] font-bold text-[var(--primary)]">Graph evidence snapshot</p>
            <p className="mt-1 text-[11px] leading-relaxed text-[var(--text-muted)]">Insert the latest high-risk case table and exposure summary directly into the report body.</p>
            <button
              onMouseDown={(e) => { e.preventDefault(); insertDataTable(); }}
              className="mt-2 text-[10px] font-bold text-[var(--primary)] hover:underline"
            >
              + Insert live graph table
            </button>
          </div>

          {suggestions.map((s, i) => (
            <div
              key={i}
              className={`rounded-xl border p-3 transition-colors hover:border-[var(--primary)]/40 ${sidebarCardClass}`}
            >
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">&ldquo;{s}&rdquo;</p>
              <button
                onMouseDown={(e) => { e.preventDefault(); insertSuggestion(s); }}
                className="mt-1.5 text-[10px] font-bold text-[var(--primary)] hover:underline"
              >
                + Insert into report
              </button>
            </div>
          ))}

          <div className="mt-4 rounded-xl border p-3" style={accentCardStyle}>
            <p className="text-[11px] font-bold text-[var(--primary)] mb-2">Audit Checklist</p>
            <ul className="space-y-1.5 text-[11px] text-[var(--text-muted)] ml-3 list-disc marker:text-[var(--primary)]">
              <li>Review risk explanation paths</li>
              <li>Verify vendor KYC status</li>
              <li>Embed exposure tables</li>
              <li>Document mitigation requirements</li>
              <li>Sign off on critical cases</li>
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
