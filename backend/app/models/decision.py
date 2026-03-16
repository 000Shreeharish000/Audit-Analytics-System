from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, Field

from app.models.approval import Approval
from app.models.employee import Employee
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.vendor import Vendor


class Decision(BaseModel):
    decision_id: str
    action: str
    actor_id: str
    timestamp: datetime
    context: Dict[str, Any] = Field(default_factory=dict)


class RuleResult(BaseModel):
    rule_id: str
    risk_score: float
    triggered_nodes: List[str]
    evidence: str
    confidence: float
    severity: float
    origin: Literal["company", "government", "system"] = "system"


class CaseResult(BaseModel):
    case_id: str
    risk_level: Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]
    actors_involved: List[str]
    path_nodes: List[str]
    rules_triggered: List[str]
    trust_score: float
    confidence: float
    transaction_amount: float
    created_at: datetime
    pathway_type: str = "single_actor_bypass"
    actor_step_counts: Dict[str, int] = Field(default_factory=dict)
    trace_id: str = ""
    visibility: Literal["shared", "admin_only"] = "shared"
    company_id: str = "DEFAULT"
    status: Literal["open", "in_review", "escalated", "closed", "false_positive"] = "open"
    owner: Optional[str] = None
    status_updated_at: Optional[datetime] = None
    closed_reason: Optional[str] = None


class AgentOpinion(BaseModel):
    agent_name: str
    provider: str
    model: str
    summary: str
    confidence: float
    recommendations: List[str] = Field(default_factory=list)
    generated_at: datetime
    external: bool = False
    egress_policy: Optional[str] = None


class AgentConsensus(BaseModel):
    overall_risk_level: str
    average_confidence: float
    conflict_score: float
    providers_used: List[str] = Field(default_factory=list)
    final_recommendations: List[str] = Field(default_factory=list)
    generated_at: datetime


class AgentAnalysis(BaseModel):
    mode: Literal["air_gapped_only", "hybrid"]
    opinions: List[AgentOpinion] = Field(default_factory=list)
    consensus: AgentConsensus


class InvestigationReport(BaseModel):
    case_id: str
    summary: str
    actors_involved: List[str]
    sequence_of_events: List[str]
    rules_triggered: List[str]
    risk_explanation: str
    counterfactual_analysis: str
    recommended_audit_actions: List[str]
    trust_score: float
    confidence: float
    generated_at: datetime
    timeline: List[Dict[str, Any]] = Field(default_factory=list)
    traceability: Dict[str, Any] = Field(default_factory=dict)
    agent_analysis: Optional[AgentAnalysis] = None


class RelationshipLink(BaseModel):
    source_id: str
    target_id: str
    relation_type: Literal["KNOWS", "REFERRED_BY", "FAMILY", "EX_COLLEAGUE", "SOCIAL"]
    confidence: float = Field(default=0.8, ge=0.0, le=1.0)
    metadata: Dict[str, Any] = Field(default_factory=dict)


class DatasetPayload(BaseModel):
    company_id: str = "DEFAULT"
    employees: List[Employee] = Field(default_factory=list)
    vendors: List[Vendor] = Field(default_factory=list)
    invoices: List[Invoice] = Field(default_factory=list)
    approvals: List[Approval] = Field(default_factory=list)
    payments: List[Payment] = Field(default_factory=list)
    relationships: List[RelationshipLink] = Field(default_factory=list)


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    expires_in_minutes: int
    locked_until: Optional[datetime] = None


class IngestResponse(BaseModel):
    status: str
    employees: int
    vendors: int
    invoices: int
    approvals: int
    payments: int
    decisions_created: int
    graph_nodes: int
    graph_edges: int
    source: Optional[str] = None


class UserProvisionRequest(BaseModel):
    username: str
    password: str
    role: Literal["admin", "auditor", "risk_analyst"]


class UserProfile(BaseModel):
    username: str
    role: str
    is_active: bool
    failed_attempts: int
    locked_until: Optional[datetime] = None


class BackupResponse(BaseModel):
    backup_dir: str
    copied_files: List[str]
    missing_files: List[str]
    created_at: datetime


class BackupRestoreRequest(BaseModel):
    backup_dir: str
    mode: Literal["preview", "inplace"] = "preview"


class BackupRestoreResponse(BaseModel):
    backup_dir: str
    mode: Literal["preview", "inplace"]
    restored_files: List[str]
    missing_files: List[str]
    created_at: datetime


class CompanyThresholds(BaseModel):
    invoice_approval_threshold: float = Field(..., gt=0)
    high_value_payment_threshold: float = Field(..., gt=0)
    required_high_value_approvals: int = Field(..., ge=1)
    max_connection_hops: int = Field(default=2, ge=1, le=6)
    conflict_reassign_limit: float = Field(default=0.65, ge=0.0, le=1.0)


class CompanyPolicyRule(BaseModel):
    rule_id: str
    title: str
    source: Literal["company", "government", "compliance"]
    severity: float = Field(default=0.7, ge=0.0, le=1.0)
    content: str
    effective_from: Optional[datetime] = None
    effective_to: Optional[datetime] = None


class CompanyPolicyProfile(BaseModel):
    company_id: str
    company_name: str
    thresholds: CompanyThresholds
    rules: List[CompanyPolicyRule] = Field(default_factory=list)
    compliance_tags: List[str] = Field(default_factory=list)
    created_by: str
    updated_at: datetime
    version: int = 1
    status: Literal["draft", "published"] = "published"
    approved_by: Optional[str] = None
    published_at: Optional[datetime] = None
    parent_version: Optional[int] = None


class CompanyPolicyUpsertRequest(BaseModel):
    company_id: str
    company_name: str
    thresholds: CompanyThresholds
    compliance_tags: List[str] = Field(default_factory=list)


class CompanyPolicyPublishRequest(BaseModel):
    version: int
    approval_note: Optional[str] = None


class CompanyPolicyVersionSummary(BaseModel):
    company_id: str
    version: int
    status: Literal["draft", "published"]
    updated_at: datetime
    approved_by: Optional[str] = None
    published_at: Optional[datetime] = None


class CompanyPolicyDocumentSummary(BaseModel):
    document_id: str
    source: Literal["company", "government", "compliance"]
    filename: str
    uploaded_by: str
    uploaded_at: datetime
    rule_count: int = 0
    excerpt: str = ""


class CompanyPolicyWorkspaceResponse(BaseModel):
    company_id: str
    draft_policy: Optional[CompanyPolicyProfile] = None
    published_policy: Optional[CompanyPolicyProfile] = None
    versions: List[CompanyPolicyVersionSummary] = Field(default_factory=list)
    documents: List[CompanyPolicyDocumentSummary] = Field(default_factory=list)


class CompanyPolicyManualUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    source: Literal["company", "government", "compliance"] = "compliance"
    title: str
    content: str = ""
    thresholds: Optional[CompanyThresholds] = None
    compliance_tags: Optional[List[str]] = None
    enrich_government: bool = True


class CompanyPolicyManualUpdateResponse(BaseModel):
    company_id: str
    source: Literal["company", "government", "compliance"]
    document_id: str
    document_title: str
    policy_draft_version: int
    rules_added: int = 0
    total_policy_rules: int
    requires_publish: bool = True
    updated_thresholds: bool = False
    compliance_tags: List[str] = Field(default_factory=list)


class CounterpartyOnboardingRequest(BaseModel):
    company_id: str
    counterparty_id: str
    counterparty_type: Literal["vendor", "client"]
    name: str
    tax_identifier: str
    country: str
    required_docs: List[str] = Field(default_factory=list)
    provided_docs: List[str] = Field(default_factory=list)
    risk_notes: Optional[str] = None


class CounterpartyRecord(BaseModel):
    company_id: str
    counterparty_id: str
    counterparty_type: str
    name: str
    tax_identifier: str
    country: str
    required_docs: List[str]
    provided_docs: List[str]
    missing_docs: List[str]
    risk_notes: Optional[str] = None
    created_at: datetime


class AuditorAlert(BaseModel):
    alert_id: str
    company_id: str
    auditor_id: str
    case_id: Optional[str] = None
    severity: float = Field(ge=0.0, le=1.0)
    reason: str
    evidence: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    visibility: Literal["admin_only"] = "admin_only"


class AuditorAssignmentRequest(BaseModel):
    company_id: str
    vendor_id: str


class AuditorAssignmentResult(BaseModel):
    company_id: str
    vendor_id: str
    auditor_id: str
    conflict_score: float
    assignment_reason: str
    assigned_at: datetime


class CaseStatusUpdateRequest(BaseModel):
    status: Literal["open", "in_review", "escalated", "closed", "false_positive"]
    owner: Optional[str] = None
    note: Optional[str] = None
    closed_reason: Optional[str] = None


class CaseStatusEvent(BaseModel):
    case_id: str
    status: Literal["open", "in_review", "escalated", "closed", "false_positive"]
    owner: Optional[str] = None
    note: Optional[str] = None
    actor: str
    created_at: datetime


class WhyNotFlaggedResponse(BaseModel):
    invoice_id: str
    company_id: str
    currently_flagged: bool
    case_ids: List[str] = Field(default_factory=list)
    reasons: List[str] = Field(default_factory=list)
    checks: Dict[str, Any] = Field(default_factory=dict)


class EvidenceBundleMeta(BaseModel):
    case_id: str
    company_id: str
    generated_at: datetime
    signature: str
    included_files: List[str]


class VendorSearchResult(BaseModel):
    vendor_id: str
    name: str
    created_by: str
    approved_by: Optional[str] = None
    invoice_count: int = 0
    payment_count: int = 0
    total_invoice_amount: float = 0.0
    total_payment_amount: float = 0.0
    matching_case_count: int = 0
    highest_risk: Optional[Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]] = None


class VendorSearchResponse(BaseModel):
    query: str
    results: List[VendorSearchResult] = Field(default_factory=list)


class VendorGraphSummary(BaseModel):
    vendor_id: str
    vendor_name: str
    created_by: str
    approved_by: Optional[str] = None
    invoice_count: int = 0
    payment_count: int = 0
    approval_count: int = 0
    employees_in_scope: int = 0
    case_count: int = 0
    rules_triggered: List[str] = Field(default_factory=list)
    total_invoice_amount: float = 0.0
    total_payment_amount: float = 0.0
    highest_risk: Optional[Literal["LOW", "MEDIUM", "HIGH", "CRITICAL"]] = None


class VendorSubgraphResponse(BaseModel):
    graph: Dict[str, Any]
    matched_cases: List[CaseResult] = Field(default_factory=list)
    summary: VendorGraphSummary


class PipelineStageMetric(BaseModel):
    label: str
    value: str


class PipelineSubprocessDetail(BaseModel):
    name: str
    detail: str
    status: Literal["ready", "completed", "attention"] = "ready"
    audit_trace: str = ""
    evidence_refs: List[str] = Field(default_factory=list)


class PipelineStageDetail(BaseModel):
    stage_id: str
    title: str
    short_title: str
    purpose: str
    status: Literal["ready", "completed", "attention"] = "ready"
    summary: str
    operations: List[str] = Field(default_factory=list)
    metrics: List[PipelineStageMetric] = Field(default_factory=list)
    subprocesses: List[PipelineSubprocessDetail] = Field(default_factory=list)


class PipelineDeepDiveResponse(BaseModel):
    generated_at: datetime
    stages: List[PipelineStageDetail] = Field(default_factory=list)
    vendor_names: List[str] = Field(default_factory=list)
    actor_names: List[str] = Field(default_factory=list)


class ReportDraftPayload(BaseModel):
    content: str = ""


class ReportDraftResponse(BaseModel):
    report_id: str = "auditor_report_draft"
    content: str = ""
    updated_at: datetime
    updated_by: str
