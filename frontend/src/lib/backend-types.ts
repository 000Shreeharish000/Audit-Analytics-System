export type BackendRole = "admin" | "auditor" | "risk_analyst";
export type DashboardRole = "admin" | "auditor";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  role: BackendRole;
  expires_in_minutes: number;
  locked_until: string | null;
}

export interface RuleResult {
  rule_id: string;
  risk_score: number;
  triggered_nodes: string[];
  evidence: string;
  confidence: number;
  severity: number;
  origin: "company" | "government" | "system";
}

export interface CaseResult {
  case_id: string;
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  actors_involved: string[];
  path_nodes: string[];
  rules_triggered: string[];
  trust_score: number;
  confidence: number;
  transaction_amount: number;
  created_at: string;
  pathway_type: string;
  actor_step_counts: Record<string, number>;
  trace_id: string;
  visibility: "shared" | "admin_only";
  company_id: string;
  status: "open" | "in_review" | "escalated" | "closed" | "false_positive";
  owner: string | null;
  status_updated_at: string | null;
  closed_reason: string | null;
}

export interface InvestigationReport {
  case_id: string;
  summary: string;
  actors_involved: string[];
  sequence_of_events: string[];
  rules_triggered: string[];
  risk_explanation: string;
  counterfactual_analysis: string;
  recommended_audit_actions: string[];
  trust_score: number;
  confidence: number;
  generated_at: string;
  timeline: Array<Record<string, unknown>>;
  traceability: Record<string, unknown>;
  agent_analysis: AgentAnalysis | null;
}

export interface AgentOpinion {
  agent_name: string;
  provider: string;
  model: string;
  summary: string;
  confidence: number;
  recommendations: string[];
  generated_at: string;
  external: boolean;
  egress_policy: string | null;
}

export interface AgentConsensus {
  overall_risk_level: string;
  average_confidence: number;
  conflict_score: number;
  providers_used: string[];
  final_recommendations: string[];
  generated_at: string;
}

export interface AgentAnalysis {
  mode: "air_gapped_only" | "hybrid";
  opinions: AgentOpinion[];
  consensus: AgentConsensus;
}

export interface GraphNode {
  id: string;
  type: string;
  label?: string;
  [key: string]: unknown;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  type: string;
  attributes: Record<string, unknown>;
}

export interface GraphPayload {
  nodes: GraphNode[];
  edges: GraphEdge[];
  node_types: Record<string, number>;
  risk_nodes: string[];
  cases: string[];
}

export interface VendorSearchResult {
  vendor_id: string;
  name: string;
  created_by: string;
  approved_by: string | null;
  invoice_count: number;
  payment_count: number;
  total_invoice_amount: number;
  total_payment_amount: number;
  matching_case_count: number;
  highest_risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
}

export interface VendorSearchResponse {
  query: string;
  results: VendorSearchResult[];
}

export interface VendorGraphSummary {
  vendor_id: string;
  vendor_name: string;
  created_by: string;
  approved_by: string | null;
  invoice_count: number;
  payment_count: number;
  approval_count: number;
  employees_in_scope: number;
  case_count: number;
  rules_triggered: string[];
  total_invoice_amount: number;
  total_payment_amount: number;
  highest_risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;
}

export interface VendorSubgraphResponse {
  graph: GraphPayload;
  matched_cases: CaseResult[];
  summary: VendorGraphSummary;
}

export interface PipelineStageMetric {
  label: string;
  value: string;
}

export interface PipelineSubprocessDetail {
  name: string;
  detail: string;
  status: "ready" | "completed" | "attention";
  audit_trace: string;
  evidence_refs: string[];
}

export interface PipelineStageDetail {
  stage_id: string;
  title: string;
  short_title: string;
  purpose: string;
  status: "ready" | "completed" | "attention";
  summary: string;
  operations: string[];
  metrics: PipelineStageMetric[];
  subprocesses: PipelineSubprocessDetail[];
}

export interface PipelineDeepDiveResponse {
  generated_at: string;
  stages: PipelineStageDetail[];
  vendor_names: string[];
  actor_names: string[];
}

export type PolicySource = "company" | "government" | "compliance";

export interface CompanyThresholds {
  invoice_approval_threshold: number;
  high_value_payment_threshold: number;
  required_high_value_approvals: number;
  max_connection_hops: number;
  conflict_reassign_limit: number;
}

export interface CompanyPolicyRule {
  rule_id: string;
  title: string;
  source: PolicySource;
  severity: number;
  content: string;
  effective_from: string | null;
  effective_to: string | null;
}

export interface CompanyPolicyProfile {
  company_id: string;
  company_name: string;
  thresholds: CompanyThresholds;
  rules: CompanyPolicyRule[];
  compliance_tags: string[];
  created_by: string;
  updated_at: string;
  version: number;
  status: "draft" | "published";
  approved_by: string | null;
  published_at: string | null;
  parent_version: number | null;
}

export interface CompanyPolicyVersionSummary {
  company_id: string;
  version: number;
  status: "draft" | "published";
  updated_at: string;
  approved_by: string | null;
  published_at: string | null;
}

export interface CompanyPolicyDocumentSummary {
  document_id: string;
  source: PolicySource;
  filename: string;
  uploaded_by: string;
  uploaded_at: string;
  rule_count: number;
  excerpt: string;
}

export interface CompanyPolicyWorkspaceResponse {
  company_id: string;
  draft_policy: CompanyPolicyProfile | null;
  published_policy: CompanyPolicyProfile | null;
  versions: CompanyPolicyVersionSummary[];
  documents: CompanyPolicyDocumentSummary[];
}

export interface CompanyPolicyManualUpdateRequest {
  company_name?: string;
  source: PolicySource;
  title: string;
  content?: string;
  thresholds?: CompanyThresholds;
  compliance_tags?: string[];
  enrich_government?: boolean;
}

export interface CompanyPolicyManualUpdateResponse {
  company_id: string;
  source: PolicySource;
  document_id: string;
  document_title: string;
  policy_draft_version: number;
  rules_added: number;
  total_policy_rules: number;
  requires_publish: boolean;
  updated_thresholds: boolean;
  compliance_tags: string[];
}

export interface PolicyDocumentUploadResult {
  company_id: string;
  document_id: string;
  source: PolicySource;
  filename: string;
  rules_extracted: number;
  policy_draft_version: number;
  requires_publish: boolean;
  total_policy_rules: number;
}

export interface PolicyDocumentUploadResponse {
  company_id: string;
  documents: PolicyDocumentUploadResult[];
}

export interface ManualAuditRequest {
  vendor_id: string;
  case_ids: string[];
  severity: string;
  notes: string;
  findings: string[];
  recommended_action: string;
}

export interface ManualAuditRecord {
  audit_id: string;
  auditor_id: string;
  vendor_id: string;
  case_ids: string[];
  severity: string;
  notes: string;
  findings: string[];
  recommended_action: string;
  created_at: string;
  status: string;
}

export interface ReportDraftPayload {
  content: string;
}

export interface ReportDraftResponse {
  report_id: string;
  content: string;
  updated_at: string;
  updated_by: string;
}

export interface SystemState {
  events_processed: number;
  nodes_created: number;
  decisions_created: number;
  rules_triggered: number;
  policy_rules_in_scope: number;
  policy_documents_in_scope: number;
  cases_detected: number;
  graph_density: number;
  risk_level: string;
  case_status_counts: Record<string, number>;
  audit_chain_valid: boolean;
  storage_counts: Record<string, number>;
  components: Record<string, string>;
  admin_alerts?: number;
}

export interface TrackedEvent {
  event_type: string;
  actor: string;
  timestamp: string;
  payload?: Record<string, unknown>;
  details?: Record<string, unknown>;
}

export interface MetricsPayload {
  metrics: {
    counters: Record<string, number>;
    gauges: Record<string, number>;
  };
  recent_events: TrackedEvent[];
  recent_audit_logs: TrackedEvent[];
  persistent_event_log: TrackedEvent[];
  backups: Array<Record<string, unknown>>;
}

export interface HealthPayload {
  status: string;
  mode: "air-gapped" | "hybrid";
  version: string;
}

export interface BackendRegulatorySignal {
  signal_id: string;
  regulator: string;
  circular: string;
  topic: string;
  status: string;
  signal_date: string;
  effective_date: string;
  summary: string;
  full_description: string;
  requirements: string[];
  gap: string | null;
  source_url: string;
  created_by: string;
  created_at: string;
}

export interface CreateSignalRequest {
  regulator: string;
  circular: string;
  topic: string;
  status?: string;
  signal_date: string;
  effective_date: string;
  summary: string;
  full_description?: string;
  requirements?: string[];
  gap?: string | null;
  source_url?: string;
}

export interface UploadSignalResponse {
  uploaded: number;
  signals: BackendRegulatorySignal[];
}
