import { create } from "zustand";
import {
  ApiError,
  detectPathways,
  getAgentAnalysis,
  getGraph,
  getHealth,
  getInvestigation,
  getSystemMetrics,
  getSystemState,
  loadDataset,
  runRules,
} from "@/lib/api";
import {
  BackendRole,
  CaseResult,
  DashboardRole,
  GraphPayload,
  InvestigationReport,
  MetricsPayload,
  RuleResult,
  SystemState,
} from "@/lib/backend-types";

type DashboardStatus = "idle" | "loading" | "ready" | "error" | "unauthenticated";
type RuntimeMode = "air-gapped" | "hybrid" | "unknown";
export type AdminSection = "overview" | "graph" | "investigation" | "policy" | "regintel" | "telemetry";
export type AuditorSection = "pipeline" | "investigation" | "report" | "policy" | "settings";

interface DashboardState {
  status: DashboardStatus;
  errorMessage: string | null;
  runtimeMode: RuntimeMode;
  token: string | null;
  userName: string | null;
  role: DashboardRole | null;
  graph: GraphPayload | null;
  systemState: SystemState | null;
  metrics: MetricsPayload | null;
  ruleResults: RuleResult[];
  cases: CaseResult[];
  bypassDetected: boolean;
  isInvestigationOpen: boolean;
  activeCaseId: string | null;
  investigation: InvestigationReport | null;
  investigationLoading: boolean;
  investigationError: string | null;
  reportContent: string;
  activeAdminSection: AdminSection;
  activeAuditorSection: AuditorSection;
  setReportContent: (content: string) => void;
  setActiveAdminSection: (section: AdminSection) => void;
  setActiveAuditorSection: (section: AuditorSection) => void;
  initialize: () => Promise<void>;
  refreshPipeline: (force?: boolean) => Promise<void>;
  openInvestigation: (caseId: string) => Promise<void>;
  closeInvestigation: () => void;
  setCredentials: (token: string, role: BackendRole, userName: string) => void;
  logout: () => void;
}

const DATASET_LOAD_COOLDOWN_MS = 4 * 60 * 1000;
const REFRESH_COOLDOWN_MS = 10 * 1000;

let initializeInFlight: Promise<void> | null = null;
let refreshInFlight: Promise<void> | null = null;
let lastDatasetLoadAt = 0;
let lastRefreshAt = 0;

function getStoredAuth(): { token: string | null; role: string | null; userName: string | null } {
  if (typeof window === "undefined") {
    return { token: null, role: null, userName: null };
  }
  return {
    token: localStorage.getItem("auth_token"),
    role: localStorage.getItem("user_role"),
    userName: localStorage.getItem("user_name"),
  };
}

function getSavedCaseId(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem("active_case_id");
}

function saveCaseId(caseId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  if (caseId) {
    localStorage.setItem("active_case_id", caseId);
  } else {
    localStorage.removeItem("active_case_id");
  }
}

function resolveCaseId(cases: CaseResult[], preferredCaseId: string | null): string | null {
  if (preferredCaseId && cases.some((item) => item.case_id === preferredCaseId)) {
    return preferredCaseId;
  }
  return cases[0]?.case_id ?? null;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 429) {
      return "Rate limit exceeded. Auto-retrying is active. Wait a few seconds and retry.";
    }
    return `${error.message} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected error";
}

const EMPTY_GRAPH: GraphPayload = { nodes: [], edges: [], node_types: {}, risk_nodes: [], cases: [] };
const EMPTY_SYSTEM_STATE: SystemState = {
  events_processed: 0,
  nodes_created: 0,
  decisions_created: 0,
  rules_triggered: 0,
  policy_rules_in_scope: 0,
  policy_documents_in_scope: 0,
  cases_detected: 0,
  graph_density: 0,
  risk_level: "LOW",
  case_status_counts: {},
  audit_chain_valid: false,
  storage_counts: {},
  components: {},
};
const EMPTY_METRICS: MetricsPayload = {
  metrics: { counters: {}, gauges: {} },
  recent_events: [],
  recent_audit_logs: [],
  persistent_event_log: [],
  backups: [],
};

function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

async function loadInvestigationWithAgents(token: string, caseId: string): Promise<InvestigationReport> {
  const investigation = await getInvestigation(token, caseId);
  if (investigation.agent_analysis) {
    return investigation;
  }

  try {
    const agentAnalysis = await getAgentAnalysis(token, caseId);
    return {
      ...investigation,
      agent_analysis: agentAnalysis,
    };
  } catch {
    return investigation;
  }
}

async function runPipeline(token: string, role: DashboardRole): Promise<{
  ruleResults: RuleResult[];
  cases: CaseResult[];
  graph: GraphPayload;
  systemState: SystemState;
  metrics: MetricsPayload;
}> {
  // For auditors, skip rule evaluation (write-only for admin).
  // Run all four data fetches in parallel and treat each failure independently
  // so a single failing endpoint never blanks out the whole dashboard.
  const ruleResults = role === "auditor" ? [] : await runRules(token);
  const [casesResult, graphResult, stateResult, metricsResult] = await Promise.allSettled([
    detectPathways(token),
    getGraph(token),
    getSystemState(token),
    getSystemMetrics(token),
  ]);

  return {
    ruleResults,
    cases: settled(casesResult, [] as CaseResult[]),
    graph: settled(graphResult, EMPTY_GRAPH),
    systemState: settled(stateResult, EMPTY_SYSTEM_STATE),
    metrics: settled(metricsResult, EMPTY_METRICS),
  };
}

function normalizeRole(role: string | null): DashboardRole {
  return role === "admin" ? "admin" : "auditor";
}

export const useDashboardStore = create<DashboardState>((set, get) => ({
  status: "idle",
  errorMessage: null,
  runtimeMode: "unknown",
  token: null,
  userName: null,
  role: null,
  graph: null,
  systemState: null,
  metrics: null,
  ruleResults: [],
  cases: [],
  bypassDetected: false,
  isInvestigationOpen: false,
  activeCaseId: null,
  investigation: null,
  investigationLoading: false,
  investigationError: null,
  reportContent: "<h1>Audit Investigation Report</h1><p>Start documenting findings here...</p>",
  activeAdminSection: "overview",
  activeAuditorSection: "pipeline",

  setReportContent: (content) => set({ reportContent: content }),
  setActiveAdminSection: (section) => set({ activeAdminSection: section }),
  setActiveAuditorSection: (section) => set({ activeAuditorSection: section }),

  initialize: async () => {
    if (initializeInFlight) {
      return initializeInFlight;
    }

    initializeInFlight = (async () => {
      set({
        status: "loading",
        errorMessage: null,
        investigation: null,
        activeCaseId: null,
        isInvestigationOpen: false,
      });
      try {
        const health = await getHealth();
        const stored = getStoredAuth();

        if (!stored.token || !stored.role) {
          set({
            status: "unauthenticated",
            runtimeMode: health.mode,
            token: null,
            role: null,
            userName: null,
          });
          return;
        }

        const storedRole = normalizeRole(stored.role);
        if (storedRole === "admin" && Date.now() - lastDatasetLoadAt > DATASET_LOAD_COOLDOWN_MS) {
          await loadDataset(stored.token);
          lastDatasetLoadAt = Date.now();
        }

        const pipeline = await runPipeline(stored.token, storedRole);
        const preferredCaseId = getSavedCaseId();
        const initialCaseId = resolveCaseId(pipeline.cases, preferredCaseId);
        let initialInvestigation: InvestigationReport | null = null;
        let initialInvestigationError: string | null = null;
        if (initialCaseId) {
          saveCaseId(initialCaseId);
          try {
            initialInvestigation = await loadInvestigationWithAgents(stored.token, initialCaseId);
          } catch (error: unknown) {
            initialInvestigationError = getErrorMessage(error);
          }
        }

        set({
          status: "ready",
          runtimeMode: health.mode,
          token: stored.token,
          userName: stored.userName ?? (storedRole === "admin" ? "Administrator" : "Auditor"),
          role: storedRole,
          ruleResults: pipeline.ruleResults,
          cases: pipeline.cases,
          graph: pipeline.graph,
          systemState: pipeline.systemState,
          metrics: pipeline.metrics,
          bypassDetected: pipeline.cases.length > 0,
          isInvestigationOpen: Boolean(initialCaseId),
          activeCaseId: initialCaseId,
          investigation: initialInvestigation,
          investigationError: initialInvestigationError,
        });
      } catch (error: unknown) {
        set({
          status: "error",
          errorMessage: getErrorMessage(error),
        });
      }
    })().finally(() => {
      initializeInFlight = null;
    });

    return initializeInFlight;
  },

  refreshPipeline: async (force = false) => {
    if (refreshInFlight) {
      return refreshInFlight;
    }

    if (!force && Date.now() - lastRefreshAt < REFRESH_COOLDOWN_MS) {
      return;
    }

    const { token, role } = get();
    if (!token || !role) {
      set({ status: "unauthenticated" });
      return;
    }

    refreshInFlight = (async () => {
      lastRefreshAt = Date.now();
      set({ status: "loading", errorMessage: null });
      try {
        const pipeline = await runPipeline(token, role);
        const preferredCaseId = get().activeCaseId ?? getSavedCaseId();
        const selectedCaseId = resolveCaseId(pipeline.cases, preferredCaseId);
        let selectedInvestigation: InvestigationReport | null = null;
        let selectedInvestigationError: string | null = null;
        if (selectedCaseId) {
          saveCaseId(selectedCaseId);
          try {
            selectedInvestigation = await loadInvestigationWithAgents(token, selectedCaseId);
          } catch (error: unknown) {
            selectedInvestigationError = getErrorMessage(error);
          }
        }

        set({
          status: "ready",
          ruleResults: pipeline.ruleResults,
          cases: pipeline.cases,
          graph: pipeline.graph,
          systemState: pipeline.systemState,
          metrics: pipeline.metrics,
          bypassDetected: pipeline.cases.length > 0,
          isInvestigationOpen: Boolean(selectedCaseId),
          activeCaseId: selectedCaseId,
          investigation: selectedInvestigation,
          investigationError: selectedInvestigationError,
        });
      } catch (error: unknown) {
        set({
          status: "error",
          errorMessage: getErrorMessage(error),
        });
      }
    })().finally(() => {
      refreshInFlight = null;
    });

    return refreshInFlight;
  },

  openInvestigation: async (caseId: string) => {
    const { token } = get();
    if (!token) {
      set({
        investigationError: "Missing authentication token. Re-initialize the dashboard.",
        isInvestigationOpen: true,
        activeCaseId: caseId,
      });
      return;
    }

    set({
      isInvestigationOpen: true,
      activeCaseId: caseId,
      investigation: null,
      investigationLoading: true,
      investigationError: null,
    });
    saveCaseId(caseId);

    try {
      const investigation = await loadInvestigationWithAgents(token, caseId);
      set({
        investigation,
        investigationLoading: false,
      });
    } catch (error: unknown) {
      set({
        investigationLoading: false,
        investigationError: getErrorMessage(error),
      });
    }
  },

  closeInvestigation: () =>
    set({
      isInvestigationOpen: false,
      activeCaseId: null,
      investigation: null,
      investigationLoading: false,
      investigationError: null,
    }),

  setCredentials: (token: string, role: BackendRole, userName: string) => {
    const normalizedRole = normalizeRole(role);
    localStorage.setItem("auth_token", token);
    localStorage.setItem("user_role", normalizedRole);
    localStorage.setItem("user_name", userName);
    lastDatasetLoadAt = 0;
    set({ status: "idle", token, role: normalizedRole, userName, errorMessage: null });
  },

  logout: () => {
    localStorage.removeItem("auth_token");
    localStorage.removeItem("user_role");
    localStorage.removeItem("user_name");
    localStorage.removeItem("active_case_id");
    lastDatasetLoadAt = 0;
    lastRefreshAt = 0;
    set({
      status: "unauthenticated",
      token: null,
      userName: null,
      role: null,
      graph: null,
      systemState: null,
      metrics: null,
      ruleResults: [],
      cases: [],
      investigation: null,
      activeCaseId: null,
      isInvestigationOpen: false,
      investigationLoading: false,
      investigationError: null,
    });
  },
}));
