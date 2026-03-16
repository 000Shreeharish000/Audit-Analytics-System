"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, FileText, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import { getPolicyWorkspace, savePolicyManualUpdate, uploadPolicyRules } from "@/lib/api";
import type {
  CompanyPolicyProfile,
  CompanyPolicyWorkspaceResponse,
  CompanyThresholds,
  PolicySource,
} from "@/lib/backend-types";
import { useDashboardStore } from "@/store/dashboard-store";

type ThresholdField = keyof CompanyThresholds;
type ThresholdForm = Record<ThresholdField, string>;

const EMPTY_THRESHOLDS: ThresholdForm = {
  invoice_approval_threshold: "",
  high_value_payment_threshold: "",
  required_high_value_approvals: "",
  max_connection_hops: "",
  conflict_reassign_limit: "",
};

const SOURCE_OPTIONS: Array<{ value: PolicySource; label: string }> = [
  { value: "company", label: "Company policy" },
  { value: "government", label: "Law / regulation" },
  { value: "compliance", label: "Compliance rule" },
];

function toThresholdForm(thresholds?: CompanyThresholds | null): ThresholdForm {
  if (!thresholds) return EMPTY_THRESHOLDS;
  return {
    invoice_approval_threshold: String(thresholds.invoice_approval_threshold),
    high_value_payment_threshold: String(thresholds.high_value_payment_threshold),
    required_high_value_approvals: String(thresholds.required_high_value_approvals),
    max_connection_hops: String(thresholds.max_connection_hops),
    conflict_reassign_limit: String(thresholds.conflict_reassign_limit),
  };
}

function parseThresholdForm(form: ThresholdForm): CompanyThresholds | null {
  const invoice = Number(form.invoice_approval_threshold);
  const payment = Number(form.high_value_payment_threshold);
  const approvals = Number(form.required_high_value_approvals);
  const hops = Number(form.max_connection_hops);
  const reassign = Number(form.conflict_reassign_limit);

  if (![invoice, payment, approvals, hops, reassign].every((value) => Number.isFinite(value))) {
    return null;
  }

  return {
    invoice_approval_threshold: invoice,
    high_value_payment_threshold: payment,
    required_high_value_approvals: Math.round(approvals),
    max_connection_hops: Math.round(hops),
    conflict_reassign_limit: reassign,
  };
}

function thresholdsEqual(left?: CompanyThresholds | null, right?: CompanyThresholds | null): boolean {
  if (!left || !right) return false;
  return (
    left.invoice_approval_threshold === right.invoice_approval_threshold
    && left.high_value_payment_threshold === right.high_value_payment_threshold
    && left.required_high_value_approvals === right.required_high_value_approvals
    && left.max_connection_hops === right.max_connection_hops
    && left.conflict_reassign_limit === right.conflict_reassign_limit
  );
}

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

export function PolicyComplianceUpdater() {
  const token = useDashboardStore((state) => state.token);
  const cases = useDashboardStore((state) => state.cases);
  const refreshPipeline = useDashboardStore((state) => state.refreshPipeline);

  const derivedCompanyId = useMemo(() => cases[0]?.company_id ?? "", [cases]);
  const [companyId, setCompanyId] = useState(derivedCompanyId);
  const [companyName, setCompanyName] = useState("");
  const [thresholds, setThresholds] = useState<ThresholdForm>(EMPTY_THRESHOLDS);
  const [tagsInput, setTagsInput] = useState("");
  const [manualTitle, setManualTitle] = useState("");
  const [manualContent, setManualContent] = useState("");
  const [manualSource, setManualSource] = useState<PolicySource>("compliance");
  const [uploadSource, setUploadSource] = useState<PolicySource>("government");
  const [manualEnrichGovernment, setManualEnrichGovernment] = useState(true);
  const [uploadEnrichGovernment, setUploadEnrichGovernment] = useState(true);
  const [files, setFiles] = useState<File[]>([]);
  const [workspace, setWorkspace] = useState<CompanyPolicyWorkspaceResponse | null>(null);
  const [loadingWorkspace, setLoadingWorkspace] = useState(false);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const draftPolicy = workspace?.draft_policy ?? null;
  const publishedPolicy = workspace?.published_policy ?? null;
  const activePolicy: CompanyPolicyProfile | null = draftPolicy ?? publishedPolicy;
  const hasBaseline = Boolean(draftPolicy || publishedPolicy);

  const loadWorkspace = useCallback(async (requestedCompanyId?: string) => {
    const targetCompanyId = (requestedCompanyId ?? companyId).trim();
    if (!token || !targetCompanyId) {
      setErrorMessage("Enter or select a company ID to load the policy workspace.");
      return null;
    }

    setLoadingWorkspace(true);
    setErrorMessage(null);
    try {
      const response = await getPolicyWorkspace(token, targetCompanyId);
      const seededProfile = response.draft_policy ?? response.published_policy;
      setWorkspace(response);
      setCompanyId(targetCompanyId);
      setCompanyName(seededProfile?.company_name ?? "");
      setThresholds(toThresholdForm(seededProfile?.thresholds));
      setTagsInput((seededProfile?.compliance_tags ?? []).join(", "));
      return response;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load policy workspace.");
      return null;
    } finally {
      setLoadingWorkspace(false);
    }
  }, [companyId, token]);

  useEffect(() => {
    if (!token || !derivedCompanyId || companyId) return;
    setCompanyId(derivedCompanyId);
    void loadWorkspace(derivedCompanyId);
  }, [companyId, derivedCompanyId, loadWorkspace, token]);

  const updateThreshold = useCallback((field: ThresholdField, value: string) => {
    setThresholds((current) => ({ ...current, [field]: value }));
  }, []);

  const handleManualSave = useCallback(async () => {
    const targetCompanyId = companyId.trim();
    const parsedThresholds = parseThresholdForm(thresholds);
    const normalizedTags = tagsInput
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);
    const thresholdPayload = parsedThresholds && (!activePolicy || !thresholdsEqual(parsedThresholds, activePolicy.thresholds))
      ? parsedThresholds
      : undefined;
    const normalizedCompanyName = companyName.trim();

    if (!token || !targetCompanyId) {
      setErrorMessage("Select a company ID before saving policy changes.");
      return;
    }
    if (!manualTitle.trim()) {
      setErrorMessage("Provide a policy update title for the change log.");
      return;
    }
    if (!hasBaseline && (!normalizedCompanyName || !parsedThresholds)) {
      setErrorMessage("The first policy draft requires both company name and policy metrics.");
      return;
    }
    if (!manualContent.trim() && !thresholdPayload && normalizedTags.length === 0 && hasBaseline) {
      setErrorMessage("Add written policy content, updated metrics, or compliance tags before saving.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      await savePolicyManualUpdate(token, targetCompanyId, {
        company_name: normalizedCompanyName || undefined,
        source: manualSource,
        title: manualTitle.trim(),
        content: manualContent.trim(),
        thresholds: hasBaseline ? thresholdPayload : parsedThresholds ?? undefined,
        compliance_tags: normalizedTags.length ? normalizedTags : undefined,
        enrich_government: manualEnrichGovernment,
      });
      await Promise.all([loadWorkspace(targetCompanyId), refreshPipeline(true)]);
      setManualTitle("");
      setManualContent("");
      setStatusMessage("Policy draft updated and telemetry refreshed successfully.");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to save policy update.");
    } finally {
      setSaving(false);
    }
  }, [
    activePolicy,
    companyId,
    companyName,
    hasBaseline,
    loadWorkspace,
    manualContent,
    manualEnrichGovernment,
    manualSource,
    manualTitle,
    refreshPipeline,
    tagsInput,
    thresholds,
    token,
  ]);

  const handleUpload = useCallback(async () => {
    const targetCompanyId = companyId.trim();
    if (!token || !targetCompanyId) {
      setErrorMessage("Select a company ID before uploading policy files.");
      return;
    }
    if (!hasBaseline) {
      setErrorMessage("Create the initial policy draft before uploading PDF or DOCX rule sources.");
      return;
    }
    if (!files.length) {
      setErrorMessage("Choose at least one PDF or DOCX file to ingest.");
      return;
    }

    setUploading(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const response = await uploadPolicyRules(token, targetCompanyId, {
        source: uploadSource,
        files,
        enrichGovernment: uploadEnrichGovernment,
      });
      await Promise.all([loadWorkspace(targetCompanyId), refreshPipeline(true)]);
      setFiles([]);
      const extractedRules = response.documents.reduce((sum, item) => sum + item.rules_extracted, 0);
      const totalPolicyRules = response.documents.reduce((max, item) => Math.max(max, item.total_policy_rules), 0);
      setStatusMessage(
        `${response.documents.length} document(s) ingested, ${extractedRules} rule(s) extracted, and dashboards synced. Policy rules in scope: ${totalPolicyRules}.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to upload policy documents.");
    } finally {
      setUploading(false);
    }
  }, [companyId, files, hasBaseline, loadWorkspace, refreshPipeline, token, uploadEnrichGovernment, uploadSource]);

  const handleSync = useCallback(async () => {
    const targetCompanyId = companyId.trim();
    if (!token || !targetCompanyId) {
      setErrorMessage("Select a company ID before syncing compliance rules.");
      return;
    }

    setSyncing(true);
    setErrorMessage(null);
    setStatusMessage(null);
    try {
      const refreshedWorkspace = await loadWorkspace(targetCompanyId);
      if (!refreshedWorkspace) {
        return;
      }
      await refreshPipeline(true);
      const refreshedPolicy = refreshedWorkspace?.draft_policy ?? refreshedWorkspace?.published_policy;
      setStatusMessage(
        `Compliance rules synced across dashboards. Active rule count is now ${refreshedPolicy?.rules.length ?? 0}.`,
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to sync compliance rules.");
    } finally {
      setSyncing(false);
    }
  }, [companyId, loadWorkspace, refreshPipeline, token]);

  return (
    <div className="custom-scrollbar flex h-full min-h-0 flex-col gap-4 overflow-y-auto pb-4 pr-1">
      <section className="neo-card px-5 py-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--primary)]">Policy & law sync</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-[var(--foreground)]">
              Governance updater for metrics, rules, and regulatory documents
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-muted)]">
              Update operational thresholds, write new internal policy notes, upload PDF/DOCX law sources,
              and immediately sync the resulting compliance changes into telemetry.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-[minmax(220px,1fr)_auto_auto]">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Company ID
              </label>
              <input
                value={companyId}
                onChange={(event) => setCompanyId(event.target.value)}
                placeholder={derivedCompanyId || "e.g. acme_corp"}
                className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--primary)]"
              />
            </div>
            <button
              onClick={() => void loadWorkspace()}
              disabled={loadingWorkspace}
              className="mt-[22px] inline-flex items-center justify-center gap-2 rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-2.5 text-sm font-semibold text-[var(--foreground)] transition-colors hover:bg-[var(--panel)] disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loadingWorkspace ? "animate-spin" : ""}`} />
              {loadingWorkspace ? "Loading..." : "Load workspace"}
            </button>
            <button
              onClick={() => void handleSync()}
              disabled={syncing}
              className="mt-[22px] inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--primary)]/10 px-4 py-2.5 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary)]/15 disabled:opacity-60"
            >
              {syncing ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {syncing ? "Syncing..." : "Sync rules to dashboards"}
            </button>
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[var(--text-muted)]">
          Manual updates and uploaded policy documents expand the active audit rule set. Use sync to reload the
          workspace and telemetry so the updated rule count is reflected across admin and auditor dashboards.
        </p>
      </section>

      {errorMessage ? (
        <div className="flex items-start gap-2 rounded-2xl border border-[var(--danger)]/25 bg-[var(--danger)]/8 px-4 py-3 text-sm text-[var(--danger)]">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {statusMessage ? (
        <div className="flex items-start gap-2 rounded-2xl border border-[#00b894]/20 bg-[#00b894]/10 px-4 py-3 text-sm text-[#0b7d62]">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>{statusMessage}</p>
        </div>
      ) : null}

      <section className="grid gap-4 lg:grid-cols-4">
        {[
          { label: "Active company", value: companyId || "Not selected" },
          { label: "Draft version", value: draftPolicy ? `v${draftPolicy.version}` : "No draft" },
          { label: "Published version", value: publishedPolicy ? `v${publishedPolicy.version}` : "Not published" },
          { label: "Active rules in scope", value: String(activePolicy?.rules.length ?? 0) },
        ].map((item) => (
          <div key={item.label} className="neo-card px-4 py-4">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">{item.label}</p>
            <p className="mt-2 text-lg font-semibold tracking-tight text-[var(--foreground)]">{item.value}</p>
          </div>
        ))}
      </section>

      {!hasBaseline ? (
        <section className="neo-card border border-[var(--primary)]/15 bg-[var(--primary)]/5 px-5 py-4">
          <p className="text-sm font-semibold text-[var(--foreground)]">No policy baseline yet for this company.</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            Create the first draft below by providing the company name, policy thresholds, and either written policy content or tags.
          </p>
        </section>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_420px]">
        <section className="neo-card p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="rounded-2xl bg-[var(--primary)]/10 p-2">
              <FileText className="h-4 w-4 text-[var(--primary)]" />
            </div>
            <div>
              <p className="text-base font-semibold text-[var(--foreground)]">Manual policy and metrics update</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                Write a new policy note, update operating thresholds, and maintain compliance tags in one controlled draft.
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Company name
              </label>
              <input
                value={companyName}
                onChange={(event) => setCompanyName(event.target.value)}
                placeholder="Official legal entity name"
                className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--primary)]"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Update source
              </label>
              <select
                value={manualSource}
                onChange={(event) => setManualSource(event.target.value as PolicySource)}
                className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--primary)]"
              >
                {SOURCE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Change log title
              </label>
              <input
                value={manualTitle}
                onChange={(event) => setManualTitle(event.target.value)}
                placeholder="e.g. Update approval thresholds for FY26 controls"
                className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--primary)]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Written policy or law update
              </label>
              <textarea
                rows={7}
                value={manualContent}
                onChange={(event) => setManualContent(event.target.value)}
                placeholder="Write the new law, policy clause, obligation summary, or compliance interpretation here..."
                className="w-full resize-none rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-3 text-sm leading-6 outline-none transition-colors focus:border-[var(--primary)]"
              />
            </div>

            <div className="md:col-span-2">
              <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                Compliance tags
              </label>
              <input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="anti-fraud, segregation-of-duties, aml"
                className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--primary)]"
              />
            </div>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[
              ["invoice_approval_threshold", "Invoice approval threshold", "100000"],
              ["high_value_payment_threshold", "High-value payment threshold", "500000"],
              ["required_high_value_approvals", "Required approvals", "2"],
              ["max_connection_hops", "Max connection hops", "2"],
              ["conflict_reassign_limit", "Conflict reassign limit", "0.65"],
            ].map(([field, label, placeholder]) => (
              <div key={field}>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  {label}
                </label>
                <input
                  type="number"
                  step={field === "conflict_reassign_limit" ? "0.01" : "1"}
                  value={thresholds[field as ThresholdField]}
                  onChange={(event) => updateThreshold(field as ThresholdField, event.target.value)}
                  placeholder={placeholder}
                  className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--primary)]"
                />
              </div>
            ))}
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm text-[var(--text-muted)]">
            <input
              type="checkbox"
              checked={manualEnrichGovernment}
              onChange={(event) => setManualEnrichGovernment(event.target.checked)}
              className="h-4 w-4 rounded border-[var(--card-border)] text-[var(--primary)] focus:ring-[var(--primary)]"
            />
            Enrich government updates with derived obligations when applicable
          </label>

          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button
              onClick={() => void handleManualSave()}
              disabled={saving}
              className="pro-button inline-flex items-center gap-2 disabled:opacity-60"
            >
              {saving ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {saving ? "Saving draft..." : "Save policy update"}
            </button>
            <p className="text-xs text-[var(--text-muted)]">
              Changes create or update a draft version and emit governance telemetry events.
            </p>
          </div>
        </section>

        <div className="flex min-h-0 flex-col gap-4">
          <section className="neo-card p-5">
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-2xl bg-[var(--primary)]/10 p-2">
                <Upload className="h-4 w-4 text-[var(--primary)]" />
              </div>
              <div>
                <p className="text-base font-semibold text-[var(--foreground)]">Upload PDF / DOCX rules</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">
                  Ingest policy documents, extract rule text, and sync the new regulatory evidence into the active draft.
                </p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Upload source
                </label>
                <select
                  value={uploadSource}
                  onChange={(event) => setUploadSource(event.target.value as PolicySource)}
                  className="w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--primary)]"
                >
                  {SOURCE_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1.5 block text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--text-muted)]">
                  Documents
                </label>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx"
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                  className="block w-full rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-3 py-2.5 text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-[var(--primary)]/10 file:px-3 file:py-1.5 file:font-semibold file:text-[var(--primary)]"
                />
                {files.length ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {files.map((file) => (
                      <span key={`${file.name}-${file.size}`} className="rounded-full bg-[var(--primary)]/10 px-3 py-1 text-xs font-medium text-[var(--primary)]">
                        {file.name}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>

              <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                <input
                  type="checkbox"
                  checked={uploadEnrichGovernment}
                  onChange={(event) => setUploadEnrichGovernment(event.target.checked)}
                  className="h-4 w-4 rounded border-[var(--card-border)] text-[var(--primary)] focus:ring-[var(--primary)]"
                />
                Add government-obligation enrichment for uploaded law documents
              </label>

              <button
                onClick={() => void handleUpload()}
                disabled={uploading || !hasBaseline}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-[var(--primary)]/20 transition-opacity hover:opacity-95 disabled:opacity-60"
              >
                {uploading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {uploading ? "Uploading..." : "Upload and sync"}
              </button>

              {!hasBaseline ? (
                <p className="text-xs text-[var(--text-muted)]">
                  Upload is enabled after the first policy draft exists for this company.
                </p>
              ) : null}
            </div>
          </section>

          <section className="neo-card p-5">
            <p className="text-base font-semibold text-[var(--foreground)]">Version timeline</p>
            <div className="mt-3 space-y-3">
              {workspace?.versions.length ? workspace.versions.slice(0, 6).map((version) => (
                <div key={`${version.company_id}-${version.version}`} className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-[var(--foreground)]">Version {version.version}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] ${version.status === "published" ? "bg-[#00b894]/10 text-[#0b7d62]" : "bg-[var(--primary)]/10 text-[var(--primary)]"}`}>
                      {version.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--text-muted)]">Updated {formatDate(version.updated_at)}</p>
                </div>
              )) : <p className="text-sm text-[var(--text-muted)]">No versions recorded yet.</p>}
            </div>
          </section>

          <section className="neo-card p-5">
            <p className="text-base font-semibold text-[var(--foreground)]">Recent supporting documents</p>
            <div className="mt-3 space-y-3">
              {workspace?.documents.length ? workspace.documents.slice(0, 5).map((document) => (
                <div key={document.document_id} className="rounded-2xl border border-[var(--card-border)] bg-[var(--background)] px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)]">{document.filename}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.14em] text-[var(--text-muted)]">
                        {document.source} · {document.rule_count} rules · {formatDate(document.uploaded_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-[var(--primary)]/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--primary)]">
                      {document.uploaded_by}
                    </span>
                  </div>
                  {document.excerpt ? (
                    <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{document.excerpt.slice(0, 180)}{document.excerpt.length > 180 ? "…" : ""}</p>
                  ) : null}
                </div>
              )) : <p className="text-sm text-[var(--text-muted)]">No uploaded policy sources yet.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
