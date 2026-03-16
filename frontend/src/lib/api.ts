import {
  AgentAnalysis,
  BackendRegulatorySignal,
  CaseResult,
  CompanyPolicyManualUpdateRequest,
  CompanyPolicyManualUpdateResponse,
  CompanyPolicyWorkspaceResponse,
  CreateSignalRequest,
  GraphPayload,
  HealthPayload,
  InvestigationReport,
  LoginResponse,
  ManualAuditRecord,
  ManualAuditRequest,
  MetricsPayload,
  PipelineDeepDiveResponse,
  PolicyDocumentUploadResponse,
  PolicySource,
  ReportDraftPayload,
  ReportDraftResponse,
  RuleResult,
  SystemState,
  UploadSignalResponse,
  VendorSearchResponse,
  VendorSubgraphResponse,
} from "@/lib/backend-types";

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000").replace(/\/+$/, "");
const DEMO_USERNAME = process.env.NEXT_PUBLIC_DEMO_USERNAME ?? "admin";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "Admin@12345";

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT";
  token?: string;
  body?: unknown | FormData;
  maxRetries?: number;
};

const inFlightGetRequests = new Map<string, Promise<unknown>>();

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isRetriableStatus(status: number): boolean {
  return status === 429 || status === 502 || status === 503 || status === 504;
}

function retryDelayMs(retryAfterHeader: string | null, attempt: number): number {
  if (retryAfterHeader) {
    const asSeconds = Number(retryAfterHeader);
    if (Number.isFinite(asSeconds) && asSeconds > 0) {
      return Math.min(asSeconds * 1000, 8000);
    }

    const asDate = Date.parse(retryAfterHeader);
    if (!Number.isNaN(asDate)) {
      return Math.min(Math.max(asDate - Date.now(), 250), 8000);
    }
  }

  const base = 350 * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 170);
  return Math.min(base + jitter, 4000);
}

async function readResponse<T>(response: Response): Promise<T> {
  const isJson = response.headers.get("content-type")?.includes("application/json");
  const payload = isJson ? ((await response.json()) as unknown) : null;

  if (!response.ok) {
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? String((payload as { detail?: unknown }).detail ?? "Request failed")
        : "Request failed";
    throw new ApiError(detail, response.status);
  }
  return payload as T;
}

async function executeRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", token, body, maxRetries } = options;
  const retries = maxRetries ?? (method === "GET" ? 3 : 1);
  const isFormData = typeof FormData !== "undefined" && body instanceof FormData;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (body !== undefined && !isFormData) {
    headers["Content-Type"] = "application/json";
  }
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let attempt = 0;
  while (true) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetch(`${API_BASE_URL}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : isFormData ? body : JSON.stringify(body),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok && isRetriableStatus(response.status) && attempt < retries) {
        await delay(retryDelayMs(response.headers.get("Retry-After"), attempt));
        attempt += 1;
        continue;
      }

      return readResponse<T>(response);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        throw new ApiError(`Request timed out after 8s (${path})`, 408);
      }
      throw err;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = options.method ?? "GET";
  const isDedupableGet = method === "GET" && options.body === undefined;

  if (!isDedupableGet) {
    return executeRequest<T>(path, options);
  }

  const dedupeKey = `${path}|${options.token ?? "anon"}`;
  const existing = inFlightGetRequests.get(dedupeKey);
  if (existing) {
    return existing as Promise<T>;
  }

  const requestPromise = executeRequest<T>(path, options).finally(() => {
    inFlightGetRequests.delete(dedupeKey);
  });

  inFlightGetRequests.set(dedupeKey, requestPromise);
  return requestPromise;
}

function buildQuery(params: Record<string, string | number | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    query.set(key, String(value));
  }
  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export async function loginWithDemoCredentials(): Promise<LoginResponse> {
  return login(DEMO_USERNAME, DEMO_PASSWORD);
}

export async function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>("/auth/login", {
    method: "POST",
    body: {
      username,
      password,
    },
  });
}

export async function getHealth(): Promise<HealthPayload> {
  return request<HealthPayload>("/health");
}

export async function loadDataset(token: string): Promise<void> {
  await request("/dataset/load", { token });
}

export async function runRules(token: string): Promise<RuleResult[]> {
  return request<RuleResult[]>("/rules/run", { token });
}

export async function detectPathways(token: string): Promise<CaseResult[]> {
  return request<CaseResult[]>("/pathways", { token });
}

export async function getGraph(token: string): Promise<GraphPayload> {
  return request<GraphPayload>("/graph", { token });
}

export async function getSystemState(token: string): Promise<SystemState> {
  return request<SystemState>("/system/state", { token });
}

export async function getSystemMetrics(token: string): Promise<MetricsPayload> {
  return request<MetricsPayload>("/system/metrics", { token });
}

export async function getInvestigation(token: string, caseId: string): Promise<InvestigationReport> {
  return request<InvestigationReport>(`/investigation/${caseId}?enhanced=true`, { token });
}

export async function getAgentAnalysis(token: string, caseId: string): Promise<AgentAnalysis> {
  return request<AgentAnalysis>(`/investigation/${caseId}/agents`, { token });
}

export async function searchVendors(token: string, query: string, limit = 12): Promise<VendorSearchResponse> {
  return request<VendorSearchResponse>(`/graph/vendors/search${buildQuery({ q: query, limit })}`, { token });
}

export async function getVendorSubgraph(
  token: string,
  vendorId: string,
  filters: {
    employeeId?: string | null;
    ruleId?: string | null;
    riskLevel?: string | null;
  } = {},
): Promise<VendorSubgraphResponse> {
  return request<VendorSubgraphResponse>(
    `/graph/vendors/${encodeURIComponent(vendorId)}/subgraph${buildQuery({
      employee_id: filters.employeeId,
      rule_id: filters.ruleId,
      risk_level: filters.riskLevel,
    })}`,
    { token },
  );
}

export async function getPipelineDeepDive(token: string): Promise<PipelineDeepDiveResponse> {
  return request<PipelineDeepDiveResponse>("/system/pipeline/deep-dive", { token });
}

export async function getPolicyWorkspace(token: string, companyId: string): Promise<CompanyPolicyWorkspaceResponse> {
  return request<CompanyPolicyWorkspaceResponse>(`/governance/policies/${encodeURIComponent(companyId)}/workspace`, { token });
}

export async function savePolicyManualUpdate(
  token: string,
  companyId: string,
  payload: CompanyPolicyManualUpdateRequest,
): Promise<CompanyPolicyManualUpdateResponse> {
  return request<CompanyPolicyManualUpdateResponse>(`/governance/policies/${encodeURIComponent(companyId)}/manual-update`, {
    method: "POST",
    token,
    body: payload,
  });
}

export async function uploadPolicyRules(
  token: string,
  companyId: string,
  params: {
    source: PolicySource;
    files: File[];
    enrichGovernment?: boolean;
  },
): Promise<PolicyDocumentUploadResponse> {
  const formData = new FormData();
  formData.append("source", params.source);
  formData.append("enrich_government", String(params.enrichGovernment ?? true));
  params.files.forEach((file) => formData.append("files", file));

  return request<PolicyDocumentUploadResponse>(`/governance/policies/${encodeURIComponent(companyId)}/rules/upload`, {
    method: "POST",
    token,
    body: formData,
  });
}

export async function getReportDraft(token: string): Promise<ReportDraftResponse> {
  return request<ReportDraftResponse>("/reports/draft", { token });
}

export async function saveReportDraft(token: string, payload: ReportDraftPayload): Promise<ReportDraftResponse> {
  return request<ReportDraftResponse>("/reports/draft", {
    method: "PUT",
    token,
    body: payload,
  });
}

export async function fetchManualAudits(token: string): Promise<ManualAuditRecord[]> {
  return request<ManualAuditRecord[]>("/audit/manual/list", { token });
}

export async function submitManualAudit(token: string, payload: ManualAuditRequest): Promise<ManualAuditRecord> {
  return request<ManualAuditRecord>("/audit/manual", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function getRegulatorySignals(token: string): Promise<BackendRegulatorySignal[]> {
  return request<BackendRegulatorySignal[]>("/regintel/signals", { token });
}

export async function createRegulatorySignal(
  token: string,
  payload: CreateSignalRequest,
): Promise<BackendRegulatorySignal> {
  return request<BackendRegulatorySignal>("/regintel/signals", {
    method: "POST",
    token,
    body: payload,
  });
}

export async function uploadRegulatorySignalDoc(
  token: string,
  params: { regulator: string; topic: string; files: File[] },
): Promise<UploadSignalResponse> {
  const formData = new FormData();
  formData.append("regulator", params.regulator);
  formData.append("topic", params.topic);
  params.files.forEach((file) => formData.append("files", file));
  return request<UploadSignalResponse>("/regintel/signals/upload", {
    method: "POST",
    token,
    body: formData,
  });
}
