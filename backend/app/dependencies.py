from __future__ import annotations

from collections import Counter
from dataclasses import replace
from datetime import datetime, timezone
import hashlib
import hmac
import io
import json
from pathlib import Path
from typing import Any, Dict, List, Optional
from uuid import uuid4
import zipfile

import networkx as nx
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

from app.config import Settings, load_settings
from app.core.agent_orchestrator import MultiAgentOrchestrator
from app.core.anomaly_guard import AnomalyGuard
from app.core.auditor_guard import AuditorGuard
from app.core.backup_manager import BackupManager
from app.core.compliance_engine import ComplianceEngine
from app.core.decision_engine import DecisionEngine
from app.core.explanation_engine import ExplanationEngine
from app.core.graph_reasoner import GraphReasoner
from app.core.model_governor import ModelGovernor
from app.core.pathway_detector import PathwayDetector
from app.core.persistence import PersistentStore
from app.core.rule_engine import GovernanceRuleEngine
from app.core.secure_ai_inference import SecureAIInferenceEngine
from app.core.trust_score_engine import TrustScoreEngine
from app.graph.graph_builder import DigitalTwinGraphBuilder
from app.graph.graph_queries import graph_to_payload
from app.models.decision import (
    AgentAnalysis,
    AuditorAlert,
    AuditorAssignmentRequest,
    AuditorAssignmentResult,
    BackupRestoreResponse,
    CaseResult,
    CaseStatusEvent,
    CaseStatusUpdateRequest,
    CompanyPolicyProfile,
    CompanyPolicyDocumentSummary,
    CompanyPolicyManualUpdateRequest,
    CompanyPolicyManualUpdateResponse,
    CompanyPolicyPublishRequest,
    CompanyPolicyRule,
    CompanyPolicyUpsertRequest,
    CompanyPolicyVersionSummary,
    CompanyPolicyWorkspaceResponse,
    CompanyThresholds,
    CounterpartyOnboardingRequest,
    CounterpartyRecord,
    DatasetPayload,
    EvidenceBundleMeta,
    IngestResponse,
    InvestigationReport,
    PipelineDeepDiveResponse,
    PipelineStageDetail,
    PipelineStageMetric,
    PipelineSubprocessDetail,
    ReportDraftPayload,
    ReportDraftResponse,
    RuleResult,
    UserProfile,
    UserProvisionRequest,
    VendorGraphSummary,
    VendorSearchResponse,
    VendorSearchResult,
    VendorSubgraphResponse,
    WhyNotFlaggedResponse,
)
from app.observability.event_tracker import EventTracker
from app.observability.metrics import MetricsRegistry
from app.observability.system_monitor import SystemMonitor
from app.security.audit_logger import AuditLogger
from app.security.auth_handler import (
    PasswordPolicyError,
    authenticate_user,
    create_access_token,
    create_password_hash,
    decode_access_token,
    validate_password_strength,
)
from app.security.encryption import DataEncryptionService

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def _parse_dt(value: object) -> Optional[datetime]:
    if value is None:
        return None
    try:
        return datetime.fromisoformat(str(value))
    except ValueError:
        return None


class RuntimeContainer:
    def __init__(self) -> None:
        self.settings: Settings = load_settings()
        self.encryption = DataEncryptionService(self.settings.data_encryption_key)
        self.audit_logger = AuditLogger(self.settings.audit_log_path, self.settings.audit_hmac_key)
        self.store = PersistentStore(self.settings.database_path, self.encryption)
        self.backup_manager = BackupManager(
            self.settings.backup_dir,
            self.settings.backup_retention_count,
        )

        self.metrics = MetricsRegistry()
        self.event_tracker = EventTracker()
        self.system_monitor = SystemMonitor()
        self.graph: nx.MultiDiGraph = nx.MultiDiGraph()
        self.graph_builder = DigitalTwinGraphBuilder(self.graph)
        self.secure_ai = SecureAIInferenceEngine()
        self.model_governor = ModelGovernor(self.settings)
        self.compliance_engine = ComplianceEngine(self.settings, self.model_governor, self.audit_logger)
        self.auditor_guard = AuditorGuard()
        self.anomaly_guard = AnomalyGuard()
        self.decision_engine = DecisionEngine()
        self.trust_score_engine = TrustScoreEngine(self.secure_ai)
        self.graph_reasoner = GraphReasoner()
        self.pathway_detector = PathwayDetector(self.graph_reasoner, self.trust_score_engine)
        self.explanation_engine = ExplanationEngine(self.secure_ai)
        self.agent_orchestrator = MultiAgentOrchestrator(
            self.settings,
            self.secure_ai,
            self.model_governor,
            self.audit_logger,
        )

        self.dataset: Optional[DatasetPayload] = None
        self.decisions = []
        self.rule_results: List[RuleResult] = []
        self.cases: Dict[str, CaseResult] = {}
        self.investigations: Dict[str, InvestigationReport] = {}
        self.auditor_alerts: Dict[str, AuditorAlert] = {}
        self.active_company_id: str = "DEFAULT"

        self._bootstrap_users()
        self._bootstrap_default_policy()
        self._load_latest_state()

    def _bootstrap_users(self) -> None:
        for username, payload in self.settings.bootstrap_users.items():
            password = payload.get("password", "")
            role = payload.get("role", "")
            if not password or not role:
                continue
            try:
                validate_password_strength(password, self.settings.password_min_length)
            except PasswordPolicyError:
                self.audit_logger.log(
                    "bootstrap_user_skipped",
                    actor="system",
                    details={"username": username, "reason": "weak_password"},
                )
                continue
            self.store.upsert_user(username, create_password_hash(password), role)

    def _bootstrap_default_policy(self) -> None:
        existing_active = self.store.get_company_policy("DEFAULT")
        if existing_active:
            try:
                profile = CompanyPolicyProfile.model_validate(existing_active)
            except Exception:
                return
            if self.store.latest_policy_version_number("DEFAULT") == 0:
                self.store.store_policy_version(
                    company_id=profile.company_id,
                    version=profile.version,
                    status=profile.status,
                    payload=profile.model_dump(mode="json"),
                    created_by=profile.created_by,
                    approved_by=profile.approved_by or profile.created_by,
                    published_at=(profile.published_at or datetime.now(timezone.utc)).isoformat(),
                )
            return

        now = datetime.now(timezone.utc)
        profile = CompanyPolicyProfile(
            company_id="DEFAULT",
            company_name="Default Demo Company",
            thresholds=CompanyThresholds(
                invoice_approval_threshold=self.settings.invoice_approval_threshold,
                high_value_payment_threshold=self.settings.high_value_payment_threshold,
                required_high_value_approvals=self.settings.required_high_value_approvals,
                max_connection_hops=2,
                conflict_reassign_limit=0.65,
            ),
            rules=[],
            compliance_tags=["baseline"],
            created_by="system",
            updated_at=now,
            version=1,
            status="published",
            approved_by="system",
            published_at=now,
        )
        self.store.upsert_company_policy(
            company_id=profile.company_id,
            company_name=profile.company_name,
            payload=profile.model_dump(mode="json"),
            updated_by="system",
        )
        self.store.store_policy_version(
            company_id=profile.company_id,
            version=profile.version,
            status=profile.status,
            payload=profile.model_dump(mode="json"),
            created_by="system",
            approved_by="system",
            published_at=now.isoformat(),
        )

    def _load_latest_state(self) -> None:
        try:
            payload = self.store.latest_dataset()
        except Exception:
            self.audit_logger.log(
                "state_restore_failed",
                actor="system",
                details={"reason": "dataset_integrity_check_failed"},
            )
            return
        if payload:
            try:
                dataset = DatasetPayload.model_validate(payload)
            except Exception:
                self.audit_logger.log(
                    "state_restore_failed",
                    actor="system",
                    details={"reason": "invalid_dataset_payload"},
                )
            else:
                self.dataset = dataset
                self.active_company_id = dataset.company_id
                self.decisions = self.decision_engine.generate(dataset)
                self._rebuild_graph(include_rules=False, include_cases=False)

        cases: list[CaseResult] = []
        for case_data in self.store.load_cases():
            try:
                cases.append(CaseResult.model_validate(case_data))
            except Exception:
                continue
        self.cases = {case.case_id: case for case in cases}
        if cases:
            self.graph_builder.add_cases(cases)

        reports = []
        for raw_payload in self.store.load_investigations():
            try:
                reports.append(InvestigationReport.model_validate(raw_payload))
            except Exception:
                continue
        self.investigations = {report.case_id: report for report in reports}

        alerts = []
        for alert_data in self.store.list_auditor_alerts(self.active_company_id):
            try:
                alerts.append(AuditorAlert.model_validate(alert_data))
            except Exception:
                continue
        self.auditor_alerts = {alert.alert_id: alert for alert in alerts}

    def _record(self, event_type: str, actor: str, details: Optional[Dict[str, Any]] = None) -> None:
        details = details or {}
        self.event_tracker.track(event_type, payload=details, actor=actor)
        self.audit_logger.log(event_type, actor=actor, details=details)
        self.store.store_event(event_type, actor, details)
        self.metrics.increment("events_processed", 1)

    def _run_backup(self, label: str) -> Dict[str, object]:
        backup = self.backup_manager.create_backup(
            label,
            [self.store.database_path, self.settings.audit_log_path],
        )
        self.metrics.increment("backup_runs", 1)
        self._record("backup_completed", "system", {"label": label, "backup_dir": backup["backup_dir"]})
        return backup

    def _policy_for_company(self, company_id: str) -> CompanyPolicyProfile:
        payload = self.store.get_company_policy(company_id)
        if not payload:
            raise HTTPException(
                status_code=400,
                detail=f"Company policy not configured for company_id={company_id}",
            )
        profile = CompanyPolicyProfile.model_validate(payload)
        if profile.status != "published":
            raise HTTPException(
                status_code=400,
                detail=f"No published policy active for company_id={company_id}",
            )
        return profile

    def _effective_policy_for_company(self, company_id: str) -> CompanyPolicyProfile:
        draft_profile = self._latest_draft_policy(company_id)
        if draft_profile:
            return draft_profile
        return self._policy_for_company(company_id)

    def _settings_for_company(self, company_id: str) -> Settings:
        profile = self._effective_policy_for_company(company_id)
        return replace(
            self.settings,
            invoice_approval_threshold=profile.thresholds.invoice_approval_threshold,
            high_value_payment_threshold=profile.thresholds.high_value_payment_threshold,
            required_high_value_approvals=profile.thresholds.required_high_value_approvals,
        )

    def _require_dataset(self) -> DatasetPayload:
        if not self.dataset:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Dataset not loaded. Use /ingest or /dataset/load first.",
            )
        return self.dataset

    def _autoload_simulated_dataset(self) -> None:
        """Load the bundled simulated dataset when no dataset is present.

        Used as a fallback so the auditor dashboard is never empty on a
        fresh backend with no prior admin session.  The dataset is ingested
        with actor='system' and triggers the normal policy / graph setup.
        """
        if self.dataset:
            return  # already loaded – nothing to do
        dataset_path = Path(__file__).resolve().parents[1] / "data" / "simulated_enterprise_dataset.json"
        if not dataset_path.exists():
            self.audit_logger.log(
                "autoload_simulated_dataset_failed",
                actor="system",
                details={"reason": "file_not_found"},
            )
            return
        try:
            with dataset_path.open("r", encoding="utf-8") as fh:
                payload = DatasetPayload.model_validate(json.load(fh))
        except Exception as exc:
            self.audit_logger.log(
                "autoload_simulated_dataset_failed",
                actor="system",
                details={"reason": str(exc)},
            )
            return
        # Use ingest_dataset so all normal guards / graph setup run.
        self.ingest_dataset(payload, actor="system", source="autoload_simulated")
        self.audit_logger.log(
            "autoload_simulated_dataset_ok",
            actor="system",
            details={"company_id": payload.company_id},
        )

    def _rebuild_graph(self, *, include_rules: bool, include_cases: bool) -> None:
        dataset = self._require_dataset()
        self.graph_builder.build_from_dataset(dataset)
        self.graph_builder.add_decision_nodes(self.decisions)
        if include_rules and self.rule_results:
            self.graph_builder.add_rule_results(self.rule_results)
        if include_cases and self.cases:
            self.graph_builder.add_cases(self.cases.values())

    def _clear_detection_state(self, company_id: str) -> None:
        self.cases = {}
        self.investigations = {}
        self.auditor_alerts = {}
        self.store.clear_cases()
        self.store.clear_auditor_alerts(company_id)

    def _case_visible(self, case: CaseResult, viewer_role: str) -> bool:
        if case.visibility == "admin_only" and viewer_role != "admin":
            return False
        return True

    def _visible_cases(self, viewer_role: str) -> list[CaseResult]:
        visible = [case for case in self.cases.values() if self._case_visible(case, viewer_role)]
        visible.sort(key=lambda case: case.trust_score, reverse=True)
        return visible

    def _ensure_case_visible(self, case: CaseResult, viewer_role: str) -> None:
        if not self._case_visible(case, viewer_role):
            raise HTTPException(status_code=404, detail="Case not found")

    def _policy_rule_results(
        self,
        *,
        dataset: DatasetPayload,
        profile: CompanyPolicyProfile,
    ) -> list[RuleResult]:
        invoice_by_id = {invoice.invoice_id: invoice for invoice in dataset.invoices}
        invoice_amount_by_id = {invoice.invoice_id: invoice.amount for invoice in dataset.invoices}
        invoices_by_vendor: Dict[str, list[str]] = {}
        for invoice in dataset.invoices:
            invoices_by_vendor.setdefault(invoice.vendor_id, []).append(invoice.invoice_id)

        approvals_by_invoice: Dict[str, list[str]] = {}
        for approval in dataset.approvals:
            if approval.target_type == "invoice":
                approvals_by_invoice.setdefault(approval.target_id, []).append(approval.employee_id)

        auditors = {
            employee.employee_id
            for employee in dataset.employees
            if "auditor" in employee.role.lower()
        }

        relationship_graph = nx.Graph()
        for employee in dataset.employees:
            relationship_graph.add_node(employee.employee_id)
            if employee.manager_id:
                relationship_graph.add_edge(employee.employee_id, employee.manager_id, relation_type="MANAGER")
        for vendor in dataset.vendors:
            relationship_graph.add_node(vendor.vendor_id)
        for relation in dataset.relationships:
            relationship_graph.add_edge(relation.source_id, relation.target_id, relation_type=relation.relation_type)

        results: list[RuleResult] = []
        for policy_rule in profile.rules:
            text = f"{policy_rule.title} {policy_rule.content}".lower()
            triggered_nodes: set[str] = set()
            total_amount = 0.0
            confidence = 0.7
            base_risk = 42 + (policy_rule.severity * 28)

            if any(token in text for token in ["same employee", "maker-checker", "separation", "vendor"]):
                for vendor in dataset.vendors:
                    if vendor.approved_by and vendor.approved_by == vendor.created_by:
                        triggered_nodes.add(vendor.vendor_id)
                        triggered_nodes.add(vendor.created_by)
                        for invoice_id in invoices_by_vendor.get(vendor.vendor_id, []):
                            triggered_nodes.add(invoice_id)
                            total_amount += invoice_amount_by_id.get(invoice_id, 0.0)
                confidence = max(confidence, 0.83)

            if any(token in text for token in ["threshold", "split", "invoice splitting", "below approval"]):
                low = profile.thresholds.invoice_approval_threshold * 0.9
                high = profile.thresholds.invoice_approval_threshold
                for approval in dataset.approvals:
                    if approval.target_type != "invoice":
                        continue
                    invoice = invoice_by_id.get(approval.target_id)
                    if not invoice:
                        continue
                    if low <= invoice.amount < high:
                        triggered_nodes.update({approval.employee_id, invoice.invoice_id, invoice.vendor_id})
                        total_amount += invoice.amount
                confidence = max(confidence, 0.8)

            if any(token in text for token in ["high value", "multi approval", "dual approval", "two approvals"]):
                threshold = profile.thresholds.high_value_payment_threshold
                min_approvals = profile.thresholds.required_high_value_approvals
                for invoice in dataset.invoices:
                    if invoice.amount >= threshold and len(approvals_by_invoice.get(invoice.invoice_id, [])) < min_approvals:
                        triggered_nodes.update({invoice.invoice_id, invoice.vendor_id})
                        triggered_nodes.update(approvals_by_invoice.get(invoice.invoice_id, []))
                        total_amount += invoice.amount
                confidence = max(confidence, 0.82)

            if any(
                token in text
                for token in ["auditor", "favorit", "favourit", "conflict", "independence", "social", "related party"]
            ):
                max_hops = profile.thresholds.max_connection_hops
                for approval in dataset.approvals:
                    if approval.employee_id not in auditors or approval.target_type != "invoice":
                        continue
                    invoice = invoice_by_id.get(approval.target_id)
                    if not invoice:
                        continue
                    if approval.employee_id not in relationship_graph or invoice.vendor_id not in relationship_graph:
                        continue
                    try:
                        hops = nx.shortest_path_length(relationship_graph, approval.employee_id, invoice.vendor_id)
                    except nx.NetworkXNoPath:
                        continue
                    if hops <= max_hops:
                        triggered_nodes.update({approval.employee_id, invoice.vendor_id, invoice.invoice_id})
                        total_amount += invoice.amount
                confidence = max(confidence, 0.85)

            if not triggered_nodes:
                continue

            scoring = self.secure_ai.score_rule(
                base_risk=base_risk,
                confidence=confidence,
                severity=policy_rule.severity,
                amount=total_amount,
                actor_repetition=max(1, len([node for node in triggered_nodes if node.startswith("E")])),
            )
            origin = "government" if policy_rule.source == "government" else "company"
            results.append(
                RuleResult(
                    rule_id=policy_rule.rule_id,
                    risk_score=scoring["risk_score"],
                    triggered_nodes=sorted(triggered_nodes),
                    evidence=f"{policy_rule.title}: {policy_rule.content[:1000]}",
                    confidence=scoring["confidence"],
                    severity=scoring["severity"],
                    origin=origin,
                )
            )
        return results

    def issue_access_token(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        user = self.store.get_user(username)
        if user and self.store.is_user_locked(username):
            self.metrics.increment("auth_failures", 1)
            self._record(
                "auth_login_blocked",
                actor=username,
                details={"reason": "account_locked", "locked_until": user.get("locked_until")},
            )
            return {
                "error": "account_locked",
                "locked_until": user.get("locked_until"),
                "role": user.get("role", ""),
            }

        authenticated = authenticate_user(username, password, user)
        if not authenticated:
            failure = self.store.record_login_failure(
                username,
                max_failed_logins=self.settings.max_failed_logins,
                lockout_minutes=self.settings.lockout_minutes,
            )
            self.metrics.increment("auth_failures", 1)
            if failure.get("locked"):
                self._record(
                    "auth_login_locked",
                    actor=username,
                    details={"locked_until": failure.get("locked_until")},
                )
                return {
                    "error": "account_locked",
                    "locked_until": failure.get("locked_until"),
                    "role": user.get("role", "") if user else "",
                }
            self._record("auth_login_failed", actor=username, details={"reason": "invalid_credentials"})
            return None

        self.store.clear_login_failures(username)
        access_token = create_access_token(
            {"sub": authenticated["username"], "role": authenticated["role"]},
            self.settings,
        )
        self._record("auth_login_success", actor=authenticated["username"], details={"role": authenticated["role"]})
        return {
            "access_token": access_token,
            "role": authenticated["role"],
            "expires_in_minutes": self.settings.access_token_expire_minutes,
            "locked_until": None,
        }

    def provision_user(self, payload: UserProvisionRequest, *, actor: str) -> UserProfile:
        try:
            validate_password_strength(payload.password, self.settings.password_min_length)
        except PasswordPolicyError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        self.store.upsert_user(payload.username, create_password_hash(payload.password), payload.role)
        self._record(
            "user_provisioned",
            actor=actor,
            details={"username": payload.username, "role": payload.role},
        )
        user_record = self.store.get_user(payload.username)
        if not user_record:
            raise HTTPException(status_code=500, detail="User provisioning failed")
        return UserProfile(
            username=payload.username,
            role=str(user_record["role"]),
            is_active=bool(int(user_record.get("is_active", 1))),
            failed_attempts=int(user_record.get("failed_attempts", 0)),
            locked_until=_parse_dt(user_record.get("locked_until")),
        )

    def list_user_profiles(self) -> list[UserProfile]:
        output: list[UserProfile] = []
        for user in self.store.list_users():
            output.append(
                UserProfile(
                    username=str(user["username"]),
                    role=str(user["role"]),
                    is_active=bool(int(user.get("is_active", 1))),
                    failed_attempts=int(user.get("failed_attempts", 0)),
                    locked_until=_parse_dt(user.get("locked_until")),
                )
            )
        return output

    def _latest_draft_policy(self, company_id: str) -> Optional[CompanyPolicyProfile]:
        versions = self.store.list_policy_versions(company_id)
        for payload in versions:
            if payload.get("status") == "draft":
                try:
                    return CompanyPolicyProfile.model_validate(payload)
                except Exception:
                    continue
        return None

    def _build_policy_document_summaries(self, company_id: str, *, limit: int = 20) -> list[CompanyPolicyDocumentSummary]:
        output: list[CompanyPolicyDocumentSummary] = []
        for document in self.store.recent_policy_documents(company_id, limit=limit):
            extracted_rules = document.get("extracted_rules", {}).get("rules", [])
            text = document.get("content", {}).get("text", "")
            output.append(
                CompanyPolicyDocumentSummary(
                    document_id=str(document["document_id"]),
                    source=str(document["source"]),  # type: ignore[arg-type]
                    filename=str(document["filename"]),
                    uploaded_by=str(document["uploaded_by"]),
                    uploaded_at=_parse_dt(document.get("uploaded_at")) or datetime.now(timezone.utc),
                    rule_count=len(extracted_rules),
                    excerpt=str(text)[:500],
                )
            )
        return output

    def _build_policy_working_profile(
        self,
        *,
        company_id: str,
        actor: str,
        company_name: Optional[str] = None,
        thresholds: Optional[CompanyThresholds] = None,
        compliance_tags: Optional[list[str]] = None,
    ) -> tuple[Optional[CompanyPolicyProfile], CompanyPolicyProfile]:
        active_payload = self.store.get_company_policy(company_id)
        active_profile = CompanyPolicyProfile.model_validate(active_payload) if active_payload else None
        draft_profile = self._latest_draft_policy(company_id)
        now = datetime.now(timezone.utc)

        if draft_profile:
            return active_profile, CompanyPolicyProfile(
                company_id=draft_profile.company_id,
                company_name=(company_name or draft_profile.company_name).strip(),
                thresholds=thresholds or draft_profile.thresholds,
                rules=list(draft_profile.rules),
                compliance_tags=list(compliance_tags) if compliance_tags is not None else list(draft_profile.compliance_tags),
                created_by=draft_profile.created_by,
                updated_at=now,
                version=draft_profile.version,
                status="draft",
                approved_by=None,
                published_at=None,
                parent_version=draft_profile.parent_version or (active_profile.version if active_profile else None),
            )

        if active_profile:
            return active_profile, CompanyPolicyProfile(
                company_id=active_profile.company_id,
                company_name=(company_name or active_profile.company_name).strip(),
                thresholds=thresholds or active_profile.thresholds,
                rules=list(active_profile.rules),
                compliance_tags=list(compliance_tags) if compliance_tags is not None else list(active_profile.compliance_tags),
                created_by=actor,
                updated_at=now,
                version=self.store.latest_policy_version_number(company_id) + 1,
                status="draft",
                approved_by=None,
                published_at=None,
                parent_version=active_profile.version,
            )

        if not company_name or thresholds is None:
            raise HTTPException(
                status_code=422,
                detail="company_name and thresholds are required to create the initial policy baseline",
            )

        return None, CompanyPolicyProfile(
            company_id=company_id,
            company_name=company_name.strip(),
            thresholds=thresholds,
            rules=[],
            compliance_tags=list(compliance_tags or []),
            created_by=actor,
            updated_at=now,
            version=self.store.latest_policy_version_number(company_id) + 1,
            status="draft",
            approved_by=None,
            published_at=None,
            parent_version=None,
        )

    def upsert_company_policy(self, payload: CompanyPolicyUpsertRequest, *, actor: str) -> CompanyPolicyProfile:
        active_payload = self.store.get_company_policy(payload.company_id)
        active_profile = CompanyPolicyProfile.model_validate(active_payload) if active_payload else None
        draft_seed = self._latest_draft_policy(payload.company_id)
        if draft_seed:
            base_rules = list(draft_seed.rules)
            parent_version = draft_seed.parent_version or active_profile.version if active_profile else None
        elif active_profile:
            base_rules = list(active_profile.rules)
            parent_version = active_profile.version
        else:
            base_rules = []
            parent_version = None

        version = self.store.latest_policy_version_number(payload.company_id) + 1
        now = datetime.now(timezone.utc)
        draft_profile = CompanyPolicyProfile(
            company_id=payload.company_id,
            company_name=payload.company_name,
            thresholds=payload.thresholds,
            rules=base_rules,
            compliance_tags=payload.compliance_tags,
            created_by=actor,
            updated_at=now,
            version=version,
            status="draft",
            approved_by=None,
            published_at=None,
            parent_version=parent_version,
        )
        self.store.store_policy_version(
            company_id=draft_profile.company_id,
            version=draft_profile.version,
            status=draft_profile.status,
            payload=draft_profile.model_dump(mode="json"),
            created_by=actor,
        )
        self._record(
            "policy_draft_created",
            actor=actor,
            details={
                "company_id": payload.company_id,
                "version": version,
                "parent_version": parent_version,
                "invoice_threshold": payload.thresholds.invoice_approval_threshold,
                "high_value_threshold": payload.thresholds.high_value_payment_threshold,
                "required_approvals": payload.thresholds.required_high_value_approvals,
            },
        )
        return draft_profile

    def get_company_policy(self, company_id: str) -> CompanyPolicyProfile:
        return self._policy_for_company(company_id)

    def get_policy_workspace(self, company_id: str, *, actor: str) -> CompanyPolicyWorkspaceResponse:
        active_payload = self.store.get_company_policy(company_id)
        active_profile = CompanyPolicyProfile.model_validate(active_payload) if active_payload else None
        draft_profile = self._latest_draft_policy(company_id)
        documents = self._build_policy_document_summaries(company_id, limit=12)
        versions = self.list_policy_versions(company_id) if (active_profile or draft_profile) else []
        self._record(
            "policy_workspace_viewed",
            actor=actor,
            details={
                "company_id": company_id,
                "has_draft": bool(draft_profile),
                "has_published": bool(active_profile),
                "documents": len(documents),
            },
        )
        return CompanyPolicyWorkspaceResponse(
            company_id=company_id,
            draft_policy=draft_profile,
            published_policy=active_profile,
            versions=versions,
            documents=documents,
        )

    def list_company_policies(self) -> list[CompanyPolicyProfile]:
        profiles = []
        for payload in self.store.list_company_policies():
            try:
                profiles.append(CompanyPolicyProfile.model_validate(payload))
            except Exception:
                continue
        profiles.sort(key=lambda item: item.company_id)
        return profiles

    def list_policy_versions(self, company_id: str) -> list[CompanyPolicyVersionSummary]:
        versions = []
        for payload in self.store.list_policy_versions(company_id):
            try:
                profile = CompanyPolicyProfile.model_validate(payload)
            except Exception:
                continue
            versions.append(
                CompanyPolicyVersionSummary(
                    company_id=profile.company_id,
                    version=profile.version,
                    status=profile.status,
                    updated_at=profile.updated_at,
                    approved_by=profile.approved_by,
                    published_at=profile.published_at,
                )
            )
        return versions

    def get_policy_version(self, company_id: str, version: int) -> CompanyPolicyProfile:
        payload = self.store.get_policy_version(company_id, version)
        if not payload:
            raise HTTPException(
                status_code=404,
                detail=f"Policy version {version} not found for company_id={company_id}",
            )
        return CompanyPolicyProfile.model_validate(payload)

    def publish_company_policy(
        self,
        company_id: str,
        payload: CompanyPolicyPublishRequest,
        *,
        actor: str,
    ) -> CompanyPolicyProfile:
        published_payload = self.store.publish_policy_version(
            company_id=company_id,
            version=payload.version,
            approved_by=actor,
            approval_note=payload.approval_note,
        )
        if not published_payload:
            raise HTTPException(
                status_code=404,
                detail=f"Policy version {payload.version} not found for company_id={company_id}",
            )
        profile = CompanyPolicyProfile.model_validate(published_payload)
        self._record(
            "policy_version_published",
            actor=actor,
            details={
                "company_id": company_id,
                "version": payload.version,
                "approval_note": payload.approval_note or "",
            },
        )
        return profile

    def ingest_policy_document(
        self,
        *,
        company_id: str,
        source: str,
        filename: str,
        content: bytes,
        actor: str,
        enrich_government: bool = True,
    ) -> Dict[str, Any]:
        normalized_source = source.strip().lower()
        if normalized_source not in {"company", "government", "compliance"}:
            raise HTTPException(status_code=422, detail="source must be one of company, government, compliance")
        if not content:
            raise HTTPException(status_code=422, detail="Uploaded file is empty")
        if len(content) > (self.settings.max_request_size_mb * 1024 * 1024):
            raise HTTPException(status_code=413, detail="Policy document exceeds max request size")

        active_payload = self.store.get_company_policy(company_id)
        active_profile = CompanyPolicyProfile.model_validate(active_payload) if active_payload else None
        draft_profile = self._latest_draft_policy(company_id)
        if draft_profile:
            working_profile = draft_profile
        else:
            if not active_profile:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "No existing policy baseline found. Create a draft via POST /governance/policies first."
                    ),
                )
            next_version = self.store.latest_policy_version_number(company_id) + 1
            working_profile = CompanyPolicyProfile(
                company_id=active_profile.company_id,
                company_name=active_profile.company_name,
                thresholds=active_profile.thresholds,
                rules=list(active_profile.rules),
                compliance_tags=list(active_profile.compliance_tags),
                created_by=actor,
                updated_at=datetime.now(timezone.utc),
                version=next_version,
                status="draft",
                approved_by=None,
                published_at=None,
                parent_version=active_profile.version,
            )
        text = self.compliance_engine.extract_text(filename, content).strip()
        if not text:
            raise HTTPException(status_code=422, detail="Could not extract readable text from document")

        prefix = f"{normalized_source[:3].upper()}_{company_id.upper()}"
        extracted_rules = self.compliance_engine.parse_rules_from_text(
            source=normalized_source,
            text=text,
            prefix=prefix,
        )
        if normalized_source == "government" and enrich_government:
            obligations = self.compliance_engine.ai_government_enrichment(text)
            for index, obligation in enumerate(obligations, start=1):
                extracted_rules.append(
                    CompanyPolicyRule(
                        rule_id=f"GOV_AI_{company_id.upper()}_{index:03d}",
                        title=f"Government AI obligation {index}",
                        source="government",
                        severity=0.82,
                        content=obligation[:1000],
                        effective_from=datetime.now(timezone.utc),
                    )
                )

        merged: Dict[str, CompanyPolicyRule] = {rule.rule_id: rule for rule in working_profile.rules}
        for rule in extracted_rules:
            merged[rule.rule_id] = rule
        now = datetime.now(timezone.utc)
        updated_profile = CompanyPolicyProfile(
            company_id=working_profile.company_id,
            company_name=working_profile.company_name,
            thresholds=working_profile.thresholds,
            rules=sorted(merged.values(), key=lambda item: item.rule_id),
            compliance_tags=working_profile.compliance_tags,
            created_by=working_profile.created_by,
            updated_at=now,
            version=working_profile.version,
            status="draft",
            approved_by=None,
            published_at=None,
            parent_version=working_profile.parent_version or (active_profile.version if active_profile else None),
        )
        self.store.store_policy_version(
            company_id=updated_profile.company_id,
            version=updated_profile.version,
            status=updated_profile.status,
            payload=updated_profile.model_dump(mode="json"),
            created_by=actor,
        )

        document = self.compliance_engine.build_document_record(
            company_id=company_id,
            source=normalized_source,
            filename=filename,
            text=text,
            extracted_rules=extracted_rules,
        )
        self.store.store_policy_document(
            document_id=document["document_id"],
            company_id=company_id,
            source=normalized_source,
            filename=filename,
            content=document["content"],
            extracted_rules={"rules": document["rules"]},
            uploaded_by=actor,
        )
        self._record(
            "policy_document_ingested",
            actor=actor,
            details={
                "company_id": company_id,
                "version": updated_profile.version,
                "source": normalized_source,
                "filename": filename,
                "rules_extracted": len(extracted_rules),
                "document_id": document["document_id"],
            },
        )
        return {
            "company_id": company_id,
            "document_id": document["document_id"],
            "source": normalized_source,
            "filename": filename,
            "rules_extracted": len(extracted_rules),
            "policy_draft_version": updated_profile.version,
            "requires_publish": True,
            "total_policy_rules": len(updated_profile.rules),
        }

    def save_manual_policy_update(
        self,
        company_id: str,
        payload: CompanyPolicyManualUpdateRequest,
        *,
        actor: str,
    ) -> CompanyPolicyManualUpdateResponse:
        normalized_source = payload.source.strip().lower()
        if normalized_source not in {"company", "government", "compliance"}:
            raise HTTPException(status_code=422, detail="source must be one of company, government, compliance")

        title = payload.title.strip()
        content = payload.content.strip()
        if not title:
            raise HTTPException(status_code=422, detail="title is required")

        active_profile, working_profile = self._build_policy_working_profile(
            company_id=company_id,
            actor=actor,
            company_name=payload.company_name,
            thresholds=payload.thresholds,
            compliance_tags=payload.compliance_tags,
        )

        metrics_changed = payload.thresholds is not None and payload.thresholds != working_profile.thresholds
        submitted_tags = [tag.strip() for tag in (payload.compliance_tags or []) if tag.strip()]
        merged_tags = list(dict.fromkeys((working_profile.compliance_tags or []) + submitted_tags))
        if not content and payload.thresholds is None and not submitted_tags:
            raise HTTPException(
                status_code=422,
                detail="Provide written content, thresholds, or compliance tags for the policy update",
            )

        now = datetime.now(timezone.utc)
        extracted_rules: list[CompanyPolicyRule] = []
        if content:
            seed_rules = self.compliance_engine.parse_rules_from_text(
                source=normalized_source,
                text=content,
                prefix=f"{normalized_source[:3].upper()}_{company_id.upper()}_MAN",
            )
            for index, rule in enumerate(seed_rules, start=1):
                extracted_rules.append(
                    CompanyPolicyRule(
                        rule_id=f"{normalized_source[:3].upper()}_{company_id.upper()}_{uuid4().hex[:10].upper()}_{index:02d}",
                        title=title if len(seed_rules) == 1 else f"{title} clause {index}",
                        source=normalized_source,  # type: ignore[arg-type]
                        severity=rule.severity,
                        content=rule.content,
                        effective_from=now,
                    )
                )
            if normalized_source == "government" and payload.enrich_government:
                obligations = self.compliance_engine.ai_government_enrichment(content)
                for index, obligation in enumerate(obligations, start=1):
                    extracted_rules.append(
                        CompanyPolicyRule(
                            rule_id=f"GOV_{company_id.upper()}_{uuid4().hex[:10].upper()}_{index:02d}",
                            title=f"{title} obligation {index}",
                            source="government",
                            severity=0.82,
                            content=obligation[:1000],
                            effective_from=now,
                        )
                    )

        merged_rules: Dict[str, CompanyPolicyRule] = {rule.rule_id: rule for rule in working_profile.rules}
        for rule in extracted_rules:
            merged_rules[rule.rule_id] = rule

        updated_profile = CompanyPolicyProfile(
            company_id=working_profile.company_id,
            company_name=working_profile.company_name,
            thresholds=payload.thresholds or working_profile.thresholds,
            rules=sorted(merged_rules.values(), key=lambda item: item.rule_id),
            compliance_tags=merged_tags,
            created_by=working_profile.created_by,
            updated_at=now,
            version=working_profile.version,
            status="draft",
            approved_by=None,
            published_at=None,
            parent_version=working_profile.parent_version or (active_profile.version if active_profile else None),
        )
        self.store.store_policy_version(
            company_id=updated_profile.company_id,
            version=updated_profile.version,
            status=updated_profile.status,
            payload=updated_profile.model_dump(mode="json"),
            created_by=actor,
        )

        threshold_summary = updated_profile.thresholds.model_dump(mode="json")
        narrative = content or "Manual governance update captured without freeform narrative."
        detail_lines = [
            f"Title: {title}",
            f"Source: {normalized_source}",
            f"Company: {updated_profile.company_name}",
            "Thresholds:",
            json.dumps(threshold_summary, indent=2, sort_keys=True),
        ]
        if merged_tags:
            detail_lines.append(f"Compliance tags: {', '.join(merged_tags)}")
        detail_lines.extend(["Narrative:", narrative])
        _safe_title = title.replace('/', '-').replace('\\', '-').strip()[:80]
        document = self.compliance_engine.build_document_record(
            company_id=company_id,
            source=normalized_source,
            filename=f"{_safe_title}.txt" or "policy-update.txt",
            text="\n".join(detail_lines),
            extracted_rules=extracted_rules,
        )
        self.store.store_policy_document(
            document_id=document["document_id"],
            company_id=company_id,
            source=normalized_source,
            filename=document["filename"],
            content=document["content"],
            extracted_rules={"rules": document["rules"]},
            uploaded_by=actor,
        )

        self._record(
            "policy_manual_update_saved",
            actor=actor,
            details={
                "company_id": company_id,
                "version": updated_profile.version,
                "source": normalized_source,
                "title": title,
                "document_id": document["document_id"],
                "rules_added": len(extracted_rules),
                "updated_thresholds": payload.thresholds is not None,
                "compliance_tags": merged_tags,
            },
        )
        return CompanyPolicyManualUpdateResponse(
            company_id=company_id,
            source=normalized_source,  # type: ignore[arg-type]
            document_id=str(document["document_id"]),
            document_title=title,
            policy_draft_version=updated_profile.version,
            rules_added=len(extracted_rules),
            total_policy_rules=len(updated_profile.rules),
            requires_publish=True,
            updated_thresholds=payload.thresholds is not None,
            compliance_tags=merged_tags,
        )

    def list_policy_documents(self, company_id: str, *, actor: str, limit: int = 20) -> list[Dict[str, Any]]:
        if not self.store.get_company_policy(company_id) and self.store.latest_policy_version_number(company_id) == 0:
            raise HTTPException(status_code=404, detail=f"No policy found for company_id={company_id}")
        output = [document.model_dump(mode="json") for document in self._build_policy_document_summaries(company_id, limit=limit)]
        self._record(
            "policy_documents_listed",
            actor=actor,
            details={"company_id": company_id, "documents": len(output)},
        )
        return output

    # ── Regulatory Intelligence ──────────────────────────────────────────────

    def list_regulatory_signals(self) -> list[Dict[str, Any]]:
        signals = self.store.list_regulatory_signals()
        self._record("regulatory_signals_listed", actor="system", details={"count": len(signals)})
        return signals

    def create_regulatory_signal(self, payload: Any, *, actor: str) -> Dict[str, Any]:
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc).isoformat()
        signal: Dict[str, Any] = {
            "signal_id": f"SIG-{payload.regulator.upper()}-{uuid4().hex[:8].upper()}",
            "regulator": payload.regulator.strip(),
            "circular": payload.circular.strip(),
            "topic": payload.topic.strip(),
            "status": payload.status or "Processed",
            "signal_date": payload.signal_date or now[:10],
            "effective_date": payload.effective_date or now[:10],
            "summary": payload.summary.strip(),
            "full_description": (payload.full_description or payload.summary).strip(),
            "requirements": list(payload.requirements or []),
            "gap": payload.gap or None,
            "source_url": payload.source_url or "",
            "created_by": actor,
            "created_at": now,
        }
        self.store.save_regulatory_signal(signal)
        self._record("regulatory_signal_created", actor=actor, details={"signal_id": signal["signal_id"], "circular": signal["circular"]})
        return signal

    def ingest_regulatory_signal_document(
        self,
        *,
        regulator: str,
        topic: str,
        filename: str,
        content: bytes,
        actor: str,
    ) -> Dict[str, Any]:
        from datetime import datetime, timezone
        if not content:
            raise HTTPException(status_code=422, detail="Uploaded file is empty")

        text = self.compliance_engine.extract_text(filename, content).strip()
        if not text:
            raise HTTPException(status_code=422, detail="Could not extract readable text from the document")

        now = datetime.now(timezone.utc)
        signal: Dict[str, Any] = {
            "signal_id": f"SIG-DOC-{uuid4().hex[:10].upper()}",
            "regulator": regulator.strip().upper(),
            "circular": f"{regulator.strip().upper()}/DOC/{now.strftime('%Y-%m-%d')}/{uuid4().hex[:6].upper()}",
            "topic": topic.strip() or filename,
            "status": "Processed",
            "signal_date": now.strftime("%Y-%m-%d"),
            "effective_date": now.strftime("%Y-%m-%d"),
            "summary": text[:500],
            "full_description": text[:2000],
            "requirements": [],
            "gap": None,
            "source_url": "",
            "created_by": actor,
            "created_at": now.isoformat(),
        }
        self.store.save_regulatory_signal(signal)
        self._record(
            "regulatory_signal_document_ingested",
            actor=actor,
            details={"signal_id": signal["signal_id"], "filename": filename, "regulator": regulator},
        )
        return signal

    def onboard_counterparty(self, payload: CounterpartyOnboardingRequest, *, actor: str) -> CounterpartyRecord:
        self._policy_for_company(payload.company_id)
        required = sorted(set(payload.required_docs))
        provided = sorted(set(payload.provided_docs))
        missing = sorted([doc for doc in required if doc not in provided])

        record = CounterpartyRecord(
            company_id=payload.company_id,
            counterparty_id=payload.counterparty_id,
            counterparty_type=payload.counterparty_type,
            name=payload.name,
            tax_identifier=payload.tax_identifier,
            country=payload.country,
            required_docs=required,
            provided_docs=provided,
            missing_docs=missing,
            risk_notes=payload.risk_notes,
            created_at=datetime.now(timezone.utc),
        )
        self.store.upsert_counterparty_record(
            company_id=record.company_id,
            counterparty_id=record.counterparty_id,
            payload=record.model_dump(mode="json"),
        )
        self._record(
            "counterparty_onboarded",
            actor=actor,
            details={
                "company_id": payload.company_id,
                "counterparty_id": payload.counterparty_id,
                "counterparty_type": payload.counterparty_type,
                "missing_docs": missing,
            },
        )
        return record

    def list_counterparties(self, company_id: str, *, actor: str) -> list[CounterpartyRecord]:
        self._policy_for_company(company_id)
        records = []
        for payload in self.store.list_counterparty_records(company_id):
            try:
                records.append(CounterpartyRecord.model_validate(payload))
            except Exception:
                continue
        records.sort(key=lambda item: item.counterparty_id)
        self._record(
            "counterparties_listed",
            actor=actor,
            details={"company_id": company_id, "count": len(records)},
        )
        return records

    def assign_auditor(self, payload: AuditorAssignmentRequest, *, actor: str) -> AuditorAssignmentResult:
        dataset = self._require_dataset()
        if dataset.company_id != payload.company_id:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Active dataset belongs to company_id={dataset.company_id}. "
                    "Load matching company dataset before assignment."
                ),
            )
        profile = self._policy_for_company(payload.company_id)
        existing_assignments = []
        for assignment in self.store.list_auditor_assignments(payload.company_id):
            try:
                existing_assignments.append(AuditorAssignmentResult.model_validate(assignment))
            except Exception:
                continue

        assignment = self.auditor_guard.assign_best_auditor(
            dataset=dataset,
            company_id=payload.company_id,
            vendor_id=payload.vendor_id,
            max_hops=profile.thresholds.max_connection_hops,
            existing_assignments=existing_assignments,
        )
        if assignment.conflict_score > profile.thresholds.conflict_reassign_limit:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"No low-conflict auditor available for vendor {payload.vendor_id}; "
                    f"best conflict score {assignment.conflict_score} exceeds "
                    f"company limit {profile.thresholds.conflict_reassign_limit}."
                ),
            )

        self.store.store_auditor_assignment(
            payload.company_id,
            payload.vendor_id,
            assignment.model_dump(mode="json"),
        )
        self._record(
            "auditor_assigned",
            actor=actor,
            details={
                "company_id": payload.company_id,
                "vendor_id": payload.vendor_id,
                "auditor_id": assignment.auditor_id,
                "conflict_score": assignment.conflict_score,
            },
        )
        return assignment

    def list_auditor_assignments(self, company_id: str, *, actor: str) -> list[AuditorAssignmentResult]:
        assignments = []
        for payload in self.store.list_auditor_assignments(company_id):
            try:
                assignments.append(AuditorAssignmentResult.model_validate(payload))
            except Exception:
                continue
        assignments.sort(key=lambda item: item.assigned_at, reverse=True)
        self._record(
            "auditor_assignments_listed",
            actor=actor,
            details={"company_id": company_id, "count": len(assignments)},
        )
        return assignments

    def list_auditor_alerts(self, company_id: str, *, actor: str) -> list[AuditorAlert]:
        alerts = []
        for payload in self.store.list_auditor_alerts(company_id):
            try:
                alerts.append(AuditorAlert.model_validate(payload))
            except Exception:
                continue
        alerts.sort(key=lambda item: item.severity, reverse=True)
        self._record(
            "auditor_alerts_viewed",
            actor=actor,
            details={"company_id": company_id, "count": len(alerts)},
        )
        return alerts

    def ingest_dataset(self, payload: DatasetPayload, *, actor: str, source: str) -> IngestResponse:
        self._policy_for_company(payload.company_id)
        self.anomaly_guard.validate_dataset(payload)

        self.dataset = payload
        self.active_company_id = payload.company_id
        self.decisions = self.decision_engine.generate(payload)
        self.rule_results = []
        self._clear_detection_state(payload.company_id)
        self._rebuild_graph(include_rules=False, include_cases=False)

        dataset_id = f"DATASET-{uuid4().hex[:12]}"
        self.store.store_dataset(dataset_id, payload.model_dump(mode="json"), source, actor)

        self.metrics.set_counter("nodes_created", float(self.graph.number_of_nodes()))
        self.metrics.set_counter("decisions_created", float(len(self.decisions)))
        self.metrics.set_counter("rules_triggered", 0)
        self.metrics.set_counter("cases_detected", 0)
        self.metrics.set_counter("investigations_generated", 0)
        self.metrics.set_gauge(
            "graph_density",
            nx.density(self.graph) if self.graph.number_of_nodes() > 1 else 0.0,
        )
        self.metrics.set_gauge("risk_level_score", 0.0)

        self._record(
            "dataset_ingested",
            actor=actor,
            details={
                "dataset_id": dataset_id,
                "source": source,
                "company_id": payload.company_id,
                "employees": len(payload.employees),
                "vendors": len(payload.vendors),
                "invoices": len(payload.invoices),
                "approvals": len(payload.approvals),
                "payments": len(payload.payments),
            },
        )
        self._record(
            "graph_updated",
            actor=actor,
            details={"nodes": self.graph.number_of_nodes(), "edges": self.graph.number_of_edges()},
        )
        self._run_backup("dataset_ingest")

        return IngestResponse(
            status="ingested",
            employees=len(payload.employees),
            vendors=len(payload.vendors),
            invoices=len(payload.invoices),
            approvals=len(payload.approvals),
            payments=len(payload.payments),
            decisions_created=len(self.decisions),
            graph_nodes=self.graph.number_of_nodes(),
            graph_edges=self.graph.number_of_edges(),
            source=source,
        )

    def run_rules(self, *, actor: str) -> list[RuleResult]:
        dataset = self._require_dataset()
        company_id = dataset.company_id
        company_settings = self._settings_for_company(company_id)
        company_profile = self._effective_policy_for_company(company_id)

        rule_engine = GovernanceRuleEngine(company_settings, self.secure_ai)
        native_results = rule_engine.run(dataset)
        policy_results = self._policy_rule_results(dataset=dataset, profile=company_profile)

        deduped: Dict[str, RuleResult] = {}
        for result in [*native_results, *policy_results]:
            existing = deduped.get(result.rule_id)
            if not existing or result.risk_score > existing.risk_score:
                deduped[result.rule_id] = result
        self.rule_results = sorted(deduped.values(), key=lambda item: item.risk_score, reverse=True)

        self._clear_detection_state(company_id)
        self._rebuild_graph(include_rules=True, include_cases=False)

        for result in self.rule_results:
            self._record(
                "rule_triggered",
                actor=actor,
                details={
                    "rule_id": result.rule_id,
                    "origin": result.origin,
                    "risk_score": result.risk_score,
                    "company_id": company_id,
                    "triggered_nodes": len(result.triggered_nodes),
                },
            )
        self.metrics.set_counter("rules_triggered", float(len(self.rule_results)))
        self.metrics.set_gauge(
            "graph_density",
            nx.density(self.graph) if self.graph.number_of_nodes() > 1 else 0.0,
        )
        return self.rule_results

    def simulate_rules(
        self,
        *,
        actor: str,
        invoice_threshold: Optional[float],
        high_value_threshold: Optional[float],
        required_approvals: Optional[int],
    ) -> Dict[str, Any]:
        dataset = self._require_dataset()
        company_id = dataset.company_id
        company_settings = self._settings_for_company(company_id)

        simulated_settings = replace(
            company_settings,
            invoice_approval_threshold=(
                invoice_threshold
                if invoice_threshold and invoice_threshold > 0
                else company_settings.invoice_approval_threshold
            ),
            high_value_payment_threshold=(
                high_value_threshold
                if high_value_threshold and high_value_threshold > 0
                else company_settings.high_value_payment_threshold
            ),
            required_high_value_approvals=(
                required_approvals
                if required_approvals and required_approvals > 0
                else company_settings.required_high_value_approvals
            ),
        )
        simulated_engine = GovernanceRuleEngine(simulated_settings, self.secure_ai)
        simulated_results = simulated_engine.run(dataset)

        self._record(
            "rule_simulation_run",
            actor=actor,
            details={
                "company_id": company_id,
                "invoice_threshold": simulated_settings.invoice_approval_threshold,
                "high_value_threshold": simulated_settings.high_value_payment_threshold,
                "required_approvals": simulated_settings.required_high_value_approvals,
                "simulated_rule_count": len(simulated_results),
            },
        )
        return {
            "company_id": company_id,
            "baseline_thresholds": {
                "invoice_approval_threshold": company_settings.invoice_approval_threshold,
                "high_value_payment_threshold": company_settings.high_value_payment_threshold,
                "required_high_value_approvals": company_settings.required_high_value_approvals,
            },
            "simulated_thresholds": {
                "invoice_approval_threshold": simulated_settings.invoice_approval_threshold,
                "high_value_payment_threshold": simulated_settings.high_value_payment_threshold,
                "required_high_value_approvals": simulated_settings.required_high_value_approvals,
            },
            "results": [result.model_dump(mode="json") for result in simulated_results],
        }

    def detect_pathways(self, *, actor: str, viewer_role: str) -> list[CaseResult]:
        # If auditor and cases are already published, return their view directly
        if viewer_role == "auditor" and self.cases:
            return self._visible_cases(viewer_role)

        # If auditor but no cases yet, auto-detect as system so the dashboard
        # is never blocked waiting for an explicit admin "publish" action.
        # Also ensure the dataset is present – on a fresh backend with no prior
        # admin session the SQLite store is empty, so we fall back to the
        # bundled simulated dataset to guarantee the auditor always has data.
        if viewer_role == "auditor" and not self.cases:
            actor = "system"
            self._autoload_simulated_dataset()

        dataset = self._require_dataset()
        company_profile = self._effective_policy_for_company(dataset.company_id)
        if not self.rule_results:
            self.run_rules(actor=actor)

        self._rebuild_graph(include_rules=True, include_cases=False)
        cases = self.pathway_detector.detect(self.graph, self.rule_results)
        now = datetime.now(timezone.utc)
        for case in cases:
            case.company_id = dataset.company_id
            case.status = "open"
            case.status_updated_at = now
            case.owner = None
            case.closed_reason = None

        alerts = self.auditor_guard.detect_favoritism_alerts(
            dataset=dataset,
            cases=cases,
            company_id=dataset.company_id,
            max_hops=company_profile.thresholds.max_connection_hops,
        )
        cases = self.auditor_guard.mark_admin_only_cases(cases, alerts)

        self.store.clear_cases()
        self.store.clear_auditor_alerts(dataset.company_id)
        self.cases = {}
        self.auditor_alerts = {}
        for case in cases:
            self.store.store_case(case.case_id, case.model_dump(mode="json"))
            self.store.append_case_status_event(
                case_id=case.case_id,
                status=case.status,
                owner=case.owner,
                note="Case created by pathway detector",
                actor=actor,
            )
            self.cases[case.case_id] = case
            self._record(
                "case_created",
                actor=actor,
                details={
                    "case_id": case.case_id,
                    "risk_level": case.risk_level,
                    "trust_score": case.trust_score,
                    "visibility": case.visibility,
                    "company_id": case.company_id,
                },
            )
        for alert in alerts:
            self.store.store_auditor_alert(
                alert.alert_id,
                alert.company_id,
                alert.auditor_id,
                alert.case_id,
                alert.model_dump(mode="json"),
            )
            self.auditor_alerts[alert.alert_id] = alert
            self._record(
                "auditor_alert_created",
                actor="system",
                details={
                    "alert_id": alert.alert_id,
                    "auditor_id": alert.auditor_id,
                    "case_id": alert.case_id,
                    "severity": alert.severity,
                    "company_id": alert.company_id,
                },
            )

        self._rebuild_graph(include_rules=True, include_cases=True)
        visible_cases = self._visible_cases(viewer_role)
        max_score = max((case.trust_score for case in visible_cases), default=0.0)
        self.metrics.set_counter("cases_detected", float(len(self.cases)))
        self.metrics.set_gauge("risk_level_score", max_score)
        self.metrics.set_gauge(
            "graph_density",
            nx.density(self.graph) if self.graph.number_of_nodes() > 1 else 0.0,
        )
        self._run_backup("pathways")
        return visible_cases

    def update_case_status(
        self,
        case_id: str,
        payload: CaseStatusUpdateRequest,
        *,
        actor: str,
    ) -> CaseResult:
        case = self.cases.get(case_id)
        if not case:
            stored = self.store.load_cases()
            for raw in stored:
                try:
                    restored = CaseResult.model_validate(raw)
                except Exception:
                    continue
                self.cases[restored.case_id] = restored
            case = self.cases.get(case_id)
        if not case:
            raise HTTPException(status_code=404, detail=f"Case {case_id} not found")

        case.status = payload.status
        case.owner = payload.owner if payload.owner is not None else case.owner
        case.status_updated_at = datetime.now(timezone.utc)
        if payload.status in {"closed", "false_positive"}:
            case.closed_reason = payload.closed_reason or payload.note or "closed_without_reason"
        else:
            case.closed_reason = None

        self.cases[case.case_id] = case
        self.store.store_case(case.case_id, case.model_dump(mode="json"))
        self.store.append_case_status_event(
            case_id=case.case_id,
            status=case.status,
            owner=case.owner,
            note=payload.note,
            actor=actor,
        )
        self._record(
            "case_status_updated",
            actor=actor,
            details={
                "case_id": case.case_id,
                "status": case.status,
                "owner": case.owner or "",
                "closed_reason": case.closed_reason or "",
            },
        )
        return case

    def list_case_status_timeline(self, case_id: str, *, actor: str, viewer_role: str) -> list[CaseStatusEvent]:
        case = self.cases.get(case_id)
        if not case:
            for raw in self.store.load_cases():
                try:
                    restored = CaseResult.model_validate(raw)
                except Exception:
                    continue
                self.cases[restored.case_id] = restored
            case = self.cases.get(case_id)
        if not case:
            raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
        self._ensure_case_visible(case, viewer_role)
        events = []
        for raw in self.store.list_case_status_events(case_id):
            try:
                events.append(CaseStatusEvent.model_validate(raw))
            except Exception:
                continue
        self._record(
            "case_status_timeline_viewed",
            actor=actor,
            details={"case_id": case_id, "events": len(events)},
        )
        return events

    def generate_investigation(
        self,
        case_id: str,
        *,
        actor: str,
        enhanced: bool,
        viewer_role: str,
    ) -> InvestigationReport:
        case = self.cases.get(case_id)
        if not case:
            stored = self.store.load_cases()
            for payload in stored:
                try:
                    restored = CaseResult.model_validate(payload)
                except Exception:
                    continue
                self.cases[restored.case_id] = restored
            case = self.cases.get(case_id)
        if not case:
            raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
        self._ensure_case_visible(case, viewer_role)

        existing = self.investigations.get(case_id)
        if existing and (not enhanced or existing.agent_analysis):
            return existing

        if not self.rule_results:
            self.run_rules(actor=actor)
        dataset = self._require_dataset()

        agent_analysis_payload: Optional[Dict[str, Any]] = None
        if enhanced:
            analysis = self.run_agent_panel(case_id, actor=actor, viewer_role=viewer_role)
            agent_analysis_payload = analysis.model_dump(mode="json")

        report = self.explanation_engine.generate(
            case=case,
            dataset=dataset,
            rule_results=self.rule_results,
            agent_analysis=agent_analysis_payload,
        )
        status_events = self.store.list_case_status_events(case_id)
        if status_events:
            report.traceability["case_status_history"] = status_events
        self.investigations[case_id] = report
        self.store.store_investigation(case_id, report.model_dump(mode="json"), actor)
        self.metrics.increment("investigations_generated", 1)
        self._record(
            "investigation_generated",
            actor=actor,
            details={
                "case_id": case_id,
                "enhanced": enhanced,
                "risk_level": case.risk_level,
                "company_id": case.company_id,
            },
        )
        self._run_backup("investigation")
        return report

    def run_agent_panel(self, case_id: str, *, actor: str, viewer_role: str) -> AgentAnalysis:
        case = self.cases.get(case_id)
        if not case:
            raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
        self._ensure_case_visible(case, viewer_role)

        evidence_map = {
            rule.rule_id: rule.evidence for rule in self.rule_results if rule.rule_id in case.rules_triggered
        }
        context = {
            "case_id": case.case_id,
            "company_id": case.company_id,
            "risk_level": case.risk_level,
            "trust_score": case.trust_score,
            "confidence": case.confidence,
            "actors_involved": case.actors_involved,
            "path_nodes": case.path_nodes,
            "rules_triggered": case.rules_triggered,
            "rule_evidence": evidence_map,
            "recommended_audit_actions": [
                "Escalate case to compliance admin for manual adjudication.",
                "Freeze high-risk payment and vendor approvals temporarily.",
                "Re-run assignment with conflict constraints and segregation controls.",
            ],
        }
        analysis = AgentAnalysis.model_validate(self.agent_orchestrator.analyze_case(context))
        self.metrics.increment("agent_analyses", 1)
        self._record(
            "agent_panel_generated",
            actor=actor,
            details={
                "case_id": case_id,
                "mode": analysis.mode,
                "opinions": len(analysis.opinions),
            },
        )
        return analysis

    def explain_why_not_flagged(
        self,
        invoice_id: str,
        *,
        actor: str,
        viewer_role: str,
    ) -> WhyNotFlaggedResponse:
        dataset = self._require_dataset()
        invoice_map = {invoice.invoice_id: invoice for invoice in dataset.invoices}
        invoice = invoice_map.get(invoice_id)
        if not invoice:
            raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")

        visible_case_ids = [
            case.case_id
            for case in self.cases.values()
            if invoice_id in case.path_nodes and self._case_visible(case, viewer_role)
        ]
        currently_flagged = bool(visible_case_ids)

        approvals = [item for item in dataset.approvals if item.target_type == "invoice" and item.target_id == invoice_id]
        payments = [item for item in dataset.payments if item.invoice_id == invoice_id]
        company_settings = self._settings_for_company(dataset.company_id)
        vendor = next((item for item in dataset.vendors if item.vendor_id == invoice.vendor_id), None)
        approver_ids = sorted({item.employee_id for item in approvals})
        creator = vendor.created_by if vendor else None
        vendor_approver = vendor.approved_by if vendor else None
        payment_actors = sorted({item.executed_by for item in payments})
        actor_steps = [set(filter(None, [creator])), set(filter(None, [vendor_approver])), set(approver_ids), set(payment_actors)]
        non_empty_steps = [step for step in actor_steps if step]
        shared_actor = set.intersection(*non_empty_steps) if non_empty_steps else set()
        all_actors = set.union(*non_empty_steps) if non_empty_steps else set()

        reasons: list[str] = []
        if currently_flagged:
            reasons.append(f"Invoice is part of detected case(s): {', '.join(visible_case_ids)}.")
        else:
            if not payments:
                reasons.append("No payment execution is linked to this invoice.")
            if len(approver_ids) >= 2:
                reasons.append("Multiple approvers reduce single-point control risk.")
            if not shared_actor and len(all_actors) >= 4:
                reasons.append("Segregation of duties appears to be preserved across workflow steps.")
            if invoice.amount < company_settings.invoice_approval_threshold:
                reasons.append("Invoice amount remains below company approval risk threshold.")
            if not reasons:
                reasons.append("No strong bypass pattern matched current rule and pathway conditions.")

        payload = WhyNotFlaggedResponse(
            invoice_id=invoice_id,
            company_id=dataset.company_id,
            currently_flagged=currently_flagged,
            case_ids=visible_case_ids,
            reasons=reasons,
            checks={
                "invoice_amount": invoice.amount,
                "invoice_threshold": company_settings.invoice_approval_threshold,
                "high_value_threshold": company_settings.high_value_payment_threshold,
                "approval_count": len(approver_ids),
                "payment_count": len(payments),
                "shared_actor_detected": bool(shared_actor),
                "actor_count": len(all_actors),
            },
        )
        self._record(
            "why_not_flagged_generated",
            actor=actor,
            details={"invoice_id": invoice_id, "currently_flagged": currently_flagged},
        )
        return payload

    def export_evidence_bundle(
        self,
        case_id: str,
        *,
        actor: str,
        viewer_role: str,
        enhanced: bool = True,
    ) -> tuple[bytes, str, EvidenceBundleMeta]:
        case = self.cases.get(case_id)
        if not case:
            for raw in self.store.load_cases():
                try:
                    restored = CaseResult.model_validate(raw)
                except Exception:
                    continue
                self.cases[restored.case_id] = restored
            case = self.cases.get(case_id)
        if not case:
            raise HTTPException(status_code=404, detail=f"Case {case_id} not found")
        self._ensure_case_visible(case, viewer_role)
        report = self.generate_investigation(
            case_id,
            actor=actor,
            enhanced=enhanced,
            viewer_role=viewer_role,
        )

        rule_nodes = [f"RULE:{rule_id}" for rule_id in case.rules_triggered]
        node_scope = set(case.path_nodes + [case.case_id, *rule_nodes])
        graph_payload = graph_to_payload(self.graph)
        scoped_nodes = [node for node in graph_payload["nodes"] if node.get("id") in node_scope]
        scoped_edges = [
            edge
            for edge in graph_payload["edges"]
            if edge.get("source") in node_scope and edge.get("target") in node_scope
        ]

        case_events = [
            event
            for event in self.store.recent_events(limit=500)
            if case_id in json.dumps(event, sort_keys=True)
        ]
        files: Dict[str, bytes] = {
            "case.json": json.dumps(case.model_dump(mode="json"), indent=2, sort_keys=True).encode("utf-8"),
            "investigation.json": json.dumps(report.model_dump(mode="json"), indent=2, sort_keys=True).encode("utf-8"),
            "graph_subgraph.json": json.dumps({"nodes": scoped_nodes, "edges": scoped_edges}, indent=2, sort_keys=True).encode("utf-8"),
            "case_events.json": json.dumps(case_events, indent=2, sort_keys=True).encode("utf-8"),
        }
        manifest = {
            file_name: hashlib.sha256(content).hexdigest()
            for file_name, content in files.items()
        }
        manifest_bytes = json.dumps(manifest, sort_keys=True).encode("utf-8")
        signature = hmac.new(
            self.settings.audit_hmac_key.encode("utf-8"),
            manifest_bytes,
            hashlib.sha256,
        ).hexdigest()

        meta = EvidenceBundleMeta(
            case_id=case.case_id,
            company_id=case.company_id,
            generated_at=datetime.now(timezone.utc),
            signature=signature,
            included_files=sorted(list(files.keys()) + ["manifest.json", "bundle_meta.json"]),
        )
        files["manifest.json"] = json.dumps(manifest, indent=2, sort_keys=True).encode("utf-8")
        files["bundle_meta.json"] = json.dumps(meta.model_dump(mode="json"), indent=2, sort_keys=True).encode("utf-8")

        bundle_stream = io.BytesIO()
        with zipfile.ZipFile(bundle_stream, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for file_name, content in files.items():
                archive.writestr(file_name, content)
        bundle_stream.seek(0)

        self._record(
            "evidence_bundle_exported",
            actor=actor,
            details={
                "case_id": case_id,
                "file_count": len(files),
                "viewer_role": viewer_role,
            },
        )
        return bundle_stream.read(), f"{case_id}_evidence_bundle.zip", meta

    def search_vendors(
        self,
        q: str,
        *,
        limit: int = 12,
        actor: str,
        viewer_role: str,
    ) -> VendorSearchResponse:
        dataset = self.dataset
        query = q.strip()
        if not dataset:
            return VendorSearchResponse(query=query, results=[])

        normalized_query = query.lower()
        visible_cases = self._visible_cases(viewer_role)
        risk_order = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}

        invoices_by_vendor: Dict[str, list[Any]] = {}
        for invoice in dataset.invoices:
            invoices_by_vendor.setdefault(invoice.vendor_id, []).append(invoice)

        payments_by_vendor: Dict[str, list[Any]] = {}
        for payment in dataset.payments:
            payments_by_vendor.setdefault(payment.vendor_id, []).append(payment)

        results: list[VendorSearchResult] = []
        for vendor in dataset.vendors:
            vendor_name = vendor.name.lower()
            vendor_id = vendor.vendor_id.lower()
            if normalized_query and normalized_query not in vendor_name and normalized_query not in vendor_id:
                continue

            vendor_cases = [case for case in visible_cases if vendor.vendor_id in case.path_nodes]
            highest_risk = None
            if vendor_cases:
                highest_risk = max(vendor_cases, key=lambda case: risk_order.get(case.risk_level, 0)).risk_level

            vendor_invoices = invoices_by_vendor.get(vendor.vendor_id, [])
            vendor_payments = payments_by_vendor.get(vendor.vendor_id, [])
            exact_match = normalized_query in {vendor_name, vendor_id} if normalized_query else False

            result = VendorSearchResult(
                vendor_id=vendor.vendor_id,
                name=vendor.name,
                created_by=vendor.created_by,
                approved_by=vendor.approved_by,
                invoice_count=len(vendor_invoices),
                payment_count=len(vendor_payments),
                total_invoice_amount=round(sum(invoice.amount for invoice in vendor_invoices), 2),
                total_payment_amount=round(sum(payment.amount for payment in vendor_payments), 2),
                matching_case_count=len(vendor_cases),
                highest_risk=highest_risk,
            )
            results.append((0 if exact_match else 1, result))

        results.sort(
            key=lambda item: (
                item[0],
                -item[1].matching_case_count,
                -item[1].total_invoice_amount,
                item[1].name.lower(),
            )
        )
        limited = [item[1] for item in results[:limit]]
        self._record(
            "vendor_search_requested",
            actor=actor,
            details={
                "query": query,
                "limit": limit,
                "results": len(limited),
                "viewer_role": viewer_role,
            },
        )
        return VendorSearchResponse(query=query, results=limited)

    def get_vendor_subgraph(
        self,
        vendor_id: str,
        *,
        employee_id: Optional[str] = None,
        rule_id: Optional[str] = None,
        risk_level: Optional[str] = None,
        actor: str,
        viewer_role: str,
    ) -> VendorSubgraphResponse:
        dataset = self._require_dataset()
        vendor = next((item for item in dataset.vendors if item.vendor_id == vendor_id), None)
        if not vendor:
            raise HTTPException(status_code=404, detail=f"Vendor {vendor_id} not found")

        vendor_invoices = [invoice for invoice in dataset.invoices if invoice.vendor_id == vendor_id]
        invoice_ids = {invoice.invoice_id for invoice in vendor_invoices}
        vendor_payments = [
            payment
            for payment in dataset.payments
            if payment.vendor_id == vendor_id or payment.invoice_id in invoice_ids
        ]
        payment_ids = {payment.payment_id for payment in vendor_payments}
        vendor_approvals = [
            approval
            for approval in dataset.approvals
            if approval.target_id == vendor_id or approval.target_id in invoice_ids or approval.target_id in payment_ids
        ]

        scoped_invoice_ids = set(invoice_ids)
        scoped_payment_ids = set(payment_ids)
        scoped_approval_ids = {approval.approval_id for approval in vendor_approvals}
        employee_ids = {vendor.created_by}
        if vendor.approved_by:
            employee_ids.add(vendor.approved_by)
        for invoice in vendor_invoices:
            if invoice.submitted_by:
                employee_ids.add(invoice.submitted_by)
        for payment in vendor_payments:
            employee_ids.add(payment.executed_by)
        for approval in vendor_approvals:
            employee_ids.add(approval.employee_id)

        if employee_id:
            scoped_invoice_ids = {
                invoice.invoice_id for invoice in vendor_invoices if invoice.submitted_by == employee_id
            }
            scoped_payment_ids = {
                payment.payment_id
                for payment in vendor_payments
                if payment.executed_by == employee_id or payment.invoice_id in scoped_invoice_ids
            }
            scoped_approval_ids = {
                approval.approval_id
                for approval in vendor_approvals
                if approval.employee_id == employee_id
                or approval.target_id == vendor_id
                or approval.target_id in scoped_invoice_ids
                or approval.target_id in scoped_payment_ids
            }
            if vendor.created_by == employee_id or vendor.approved_by == employee_id:
                employee_ids = {employee_id}
            else:
                employee_ids = {employee_id} if employee_id in employee_ids else set()

        operational_nodes = {vendor_id, *scoped_invoice_ids, *scoped_payment_ids, *scoped_approval_ids, *employee_ids}
        visible_cases = [case for case in self._visible_cases(viewer_role) if vendor_id in case.path_nodes]
        if employee_id:
            visible_cases = [
                case
                for case in visible_cases
                if employee_id in case.path_nodes or employee_id in case.actors_involved
            ]
        if rule_id:
            visible_cases = [case for case in visible_cases if rule_id in case.rules_triggered]
        if risk_level:
            normalized_risk = risk_level.upper()
            visible_cases = [case for case in visible_cases if case.risk_level == normalized_risk]
        else:
            normalized_risk = None

        relevant_rule_results = [
            result for result in self.rule_results if set(result.triggered_nodes) & operational_nodes
        ]
        if rule_id:
            relevant_rule_results = [result for result in relevant_rule_results if result.rule_id == rule_id]

        relevant_rule_ids = {result.rule_id for result in relevant_rule_results}
        for case in visible_cases:
            relevant_rule_ids.update(case.rules_triggered)

        included_nodes = set(operational_nodes)
        for node_id in list(operational_nodes):
            if not self.graph.has_node(node_id):
                continue
            for related_id in self.graph.predecessors(node_id):
                if self.graph.nodes[related_id].get("type") == "Decision":
                    included_nodes.add(related_id)
            for related_id in self.graph.successors(node_id):
                if self.graph.nodes[related_id].get("type") == "Decision":
                    included_nodes.add(related_id)

        for case in visible_cases:
            included_nodes.add(case.case_id)
            included_nodes.update(case.path_nodes)
        for current_rule_id in relevant_rule_ids:
            included_nodes.add(f"RULE:{current_rule_id}")

        graph_node_ids = [node_id for node_id in included_nodes if self.graph.has_node(node_id)]
        vendor_graph = self.graph.subgraph(graph_node_ids).copy()
        payload = graph_to_payload(vendor_graph)
        graph_node_id_set = {node["id"] for node in payload["nodes"]}
        payload["cases"] = [case.case_id for case in visible_cases if case.case_id in graph_node_id_set]

        scoped_invoices = [invoice for invoice in vendor_invoices if invoice.invoice_id in graph_node_ids]
        scoped_payments = [payment for payment in vendor_payments if payment.payment_id in graph_node_ids]
        scoped_approvals = [approval for approval in vendor_approvals if approval.approval_id in graph_node_ids]
        highest_case_risk = None
        if visible_cases:
            highest_case_risk = max(
                visible_cases,
                key=lambda case: {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}.get(case.risk_level, 0),
            ).risk_level
        elif relevant_rule_results:
            highest_case_risk = self.secure_ai.risk_band(
                max(result.risk_score for result in relevant_rule_results)
            )

        summary = VendorGraphSummary(
            vendor_id=vendor.vendor_id,
            vendor_name=vendor.name,
            created_by=vendor.created_by,
            approved_by=vendor.approved_by,
            invoice_count=len(scoped_invoices),
            payment_count=len(scoped_payments),
            approval_count=len(scoped_approvals),
            employees_in_scope=len({node_id for node_id in graph_node_ids if node_id in employee_ids}),
            case_count=len(visible_cases),
            rules_triggered=sorted(relevant_rule_ids),
            total_invoice_amount=round(sum(invoice.amount for invoice in scoped_invoices), 2),
            total_payment_amount=round(sum(payment.amount for payment in scoped_payments), 2),
            highest_risk=highest_case_risk,
        )
        self._record(
            "vendor_subgraph_requested",
            actor=actor,
            details={
                "vendor_id": vendor_id,
                "employee_id": employee_id,
                "rule_id": rule_id,
                "risk_level": normalized_risk,
                "viewer_role": viewer_role,
                "nodes": len(payload["nodes"]),
                "cases": len(visible_cases),
            },
        )
        return VendorSubgraphResponse(graph=payload, matched_cases=visible_cases, summary=summary)

    def get_pipeline_deep_dive(self, *, actor: str, viewer_role: str) -> PipelineDeepDiveResponse:
        dataset = self.dataset
        visible_cases = self._visible_cases(viewer_role)
        state = self.system_monitor.state_snapshot(self)
        if viewer_role != "admin":
            max_score = max((case.trust_score for case in visible_cases), default=0.0)
            storage_counts = dict(state.get("storage_counts", {}))
            storage_counts["auditor_alerts"] = 0
            state["storage_counts"] = storage_counts
            state["cases_detected"] = len(visible_cases)
            state["risk_level"] = self.secure_ai.risk_band(max_score)
        else:
            state["admin_alerts"] = len(self.auditor_alerts)

        def metric(label: str, value: object) -> PipelineStageMetric:
            return PipelineStageMetric(label=label, value=str(value))

        def subprocess(
            name: str,
            detail: str,
            *,
            status: str,
            audit_trace: str,
            evidence_refs: list[str],
        ) -> PipelineSubprocessDetail:
            return PipelineSubprocessDetail(
                name=name,
                detail=detail,
                status=status,
                audit_trace=audit_trace,
                evidence_refs=evidence_refs,
            )

        vendor_count = len(dataset.vendors) if dataset else 0
        employee_count = len(dataset.employees) if dataset else 0
        invoice_count = len(dataset.invoices) if dataset else 0
        approval_count = len(dataset.approvals) if dataset else 0
        payment_count = len(dataset.payments) if dataset else 0
        decision_count = len(self.decisions)
        graph_nodes = self.graph.number_of_nodes()
        graph_edges = self.graph.number_of_edges()
        rule_count = len(self.rule_results)
        investigation_count = len(self.investigations)
        report_draft_count = int(state.get("storage_counts", {}).get("report_drafts", 0))
        recent_events = self.event_tracker.recent(limit=8)
        persistent_events = self.store.recent_events(limit=8)
        recent_event_types = [str(event.get("event_type", "")) for event in recent_events]
        latest_event = recent_events[0] if recent_events else None
        latest_persistent = persistent_events[0] if persistent_events else None
        total_exposure = round(sum(case.transaction_amount for case in visible_cases), 2)

        def stage_status(*, ready: bool, attention: bool = False) -> str:
            if not ready:
                return "ready"
            return "attention" if attention else "completed"

        stages = [
            PipelineStageDetail(
                stage_id="sources",
                title="Enterprise Data Sources",
                short_title="Sources",
                purpose="The active prototype starts from the currently loaded employees, vendors, invoices, approvals, and payment events.",
                status=stage_status(ready=bool(dataset)),
                summary=(
                    f"Loaded {vendor_count} vendors, {employee_count} employees, and {invoice_count} invoices for company "
                    f"{dataset.company_id}."
                    if dataset
                    else "No dataset is loaded into the runtime yet."
                ),
                operations=[
                    "Vendor master records",
                    "Employee roster",
                    "Invoice ledger",
                    "Approval events",
                    "Payment executions",
                ],
                metrics=[
                    metric("Vendors", vendor_count),
                    metric("Employees", employee_count),
                    metric("Invoices", invoice_count),
                    metric("Payments", payment_count),
                ],
                subprocesses=[
                    subprocess(
                        "Vendor feed",
                        f"{vendor_count} vendor records are available for graphing and case correlation.",
                        status=stage_status(ready=vendor_count > 0),
                        audit_trace="dataset.vendors",
                        evidence_refs=[dataset.company_id] if dataset else [],
                    ),
                    subprocess(
                        "Invoice stream",
                        f"{invoice_count} invoices and {payment_count} payments are currently in scope.",
                        status=stage_status(ready=invoice_count > 0),
                        audit_trace="dataset.invoices + dataset.payments",
                        evidence_refs=[str(invoice_count), str(payment_count)],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="ingestion",
                title="Data Ingestion Layer",
                short_title="Ingest",
                purpose="The runtime validates the incoming dataset, persists it to SQLite, and resets pathway state before downstream analysis.",
                status=stage_status(ready=bool(dataset)),
                summary=(
                    f"SQLite currently holds {state.get('storage_counts', {}).get('datasets', 0)} dataset snapshot(s)."
                    if dataset
                    else "Waiting for an admin dataset load or restored persisted state."
                ),
                operations=[
                    "DatasetPayload validation",
                    "Company policy guard",
                    "SQLite persistence",
                    "Detection-state reset",
                ],
                metrics=[
                    metric("Stored datasets", state.get("storage_counts", {}).get("datasets", 0)),
                    metric("Events processed", state.get("events_processed", 0)),
                ],
                subprocesses=[
                    subprocess(
                        "Ingest runtime",
                        "container.ingest_dataset() persists the payload and rebuilds the graph before rules/pathways run.",
                        status=stage_status(ready=bool(dataset)),
                        audit_trace="RuntimeContainer.ingest_dataset",
                        evidence_refs=[str(state.get("storage_counts", {}).get("datasets", 0))],
                    ),
                    subprocess(
                        "Persistence store",
                        f"Database counts currently report {state.get('storage_counts', {}).get('events', 0)} stored system events.",
                        status=stage_status(ready=True),
                        audit_trace="PersistentStore.counts",
                        evidence_refs=[str(state.get("storage_counts", {}).get("events", 0))],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="validation",
                title="Validation & Policy Checks",
                short_title="Validate",
                purpose="Schema checks, anomaly guards, and company policy activation happen before the graph and rule engines use the data.",
                status=stage_status(ready=bool(dataset)),
                summary=(
                    "The current runtime accepted the active dataset; reject counts are not separately surfaced in telemetry yet."
                    if dataset
                    else "Validation will begin as soon as a dataset is loaded."
                ),
                operations=[
                    "Pydantic schema enforcement",
                    "AnomalyGuard dataset validation",
                    "Company policy activation check",
                ],
                metrics=[
                    metric("Company", dataset.company_id if dataset else "—"),
                    metric("Policy versions", state.get("storage_counts", {}).get("policy_versions", 0)),
                ],
                subprocesses=[
                    subprocess(
                        "Schema validator",
                        "DatasetPayload model validation runs before any entity is accepted into the runtime.",
                        status=stage_status(ready=bool(dataset)),
                        audit_trace="app.models.decision.DatasetPayload",
                        evidence_refs=["DatasetPayload"],
                    ),
                    subprocess(
                        "Policy profile check",
                        "The active company must have a published policy profile before ingestion can complete.",
                        status=stage_status(ready=bool(dataset)),
                        audit_trace="RuntimeContainer._policy_for_company",
                        evidence_refs=[str(state.get("storage_counts", {}).get("company_policies", 0))],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="extraction",
                title="Entity Extraction & Graph Build",
                short_title="Extract",
                purpose="Validated records are converted into typed graph nodes and relationships for vendors, invoices, approvals, payments, and decisions.",
                status=stage_status(ready=graph_nodes > 0),
                summary=(
                    f"The graph currently contains {graph_nodes} nodes and {graph_edges} edges."
                    if graph_nodes
                    else "No graph has been materialized yet."
                ),
                operations=[
                    "Employee nodes",
                    "Vendor nodes",
                    "Invoice nodes",
                    "Approval nodes",
                    "Payment nodes",
                ],
                metrics=[
                    metric("Nodes", graph_nodes),
                    metric("Edges", graph_edges),
                    metric("Approvals", approval_count),
                ],
                subprocesses=[
                    subprocess(
                        "Graph builder",
                        "DigitalTwinGraphBuilder rebuilds the live MultiDiGraph from the active dataset and decision records.",
                        status=stage_status(ready=graph_nodes > 0),
                        audit_trace="DigitalTwinGraphBuilder.build_from_dataset",
                        evidence_refs=[str(graph_nodes), str(graph_edges)],
                    ),
                    subprocess(
                        "Decision nodes",
                        f"{decision_count} decision nodes are attached to the operational graph where context entities are present.",
                        status=stage_status(ready=decision_count > 0),
                        audit_trace="DigitalTwinGraphBuilder.add_decision_nodes",
                        evidence_refs=[str(decision_count)],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="graph",
                title="Financial Digital Twin Graph",
                short_title="Graph",
                purpose="The graph is the shared runtime used by governance rules, pathway detection, and investigation explainability.",
                status=stage_status(ready=graph_nodes > 0),
                summary=(
                    f"Current graph density is {state.get('graph_density', 0)} with {len(self.graph.nodes())} active serialized nodes."
                    if graph_nodes
                    else "Graph analysis is idle until data has been loaded."
                ),
                operations=[
                    "Graph serialization",
                    "Risk node marking",
                    "Vendor subgraph extraction",
                    "Case linkage",
                ],
                metrics=[
                    metric("Node types", len(graph_to_payload(self.graph).get("node_types", {})) if graph_nodes else 0),
                    metric("Risk nodes", len(graph_to_payload(self.graph).get("risk_nodes", [])) if graph_nodes else 0),
                    metric("Density", state.get("graph_density", 0)),
                ],
                subprocesses=[
                    subprocess(
                        "Live graph endpoint",
                        "GET /graph and vendor-scoped graph routes serialize the same live runtime graph.",
                        status=stage_status(ready=graph_nodes > 0),
                        audit_trace="graph_to_payload",
                        evidence_refs=["/graph", "/graph/vendors/{vendor_id}/subgraph"],
                    ),
                    subprocess(
                        "Case visibility filter",
                        "Admin-only cases are removed from serialized payloads for non-admin viewers.",
                        status=stage_status(ready=bool(self.cases)),
                        audit_trace="RuntimeContainer.get_graph_payload",
                        evidence_refs=[viewer_role],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="decision",
                title="Decision Engine",
                short_title="Decision",
                purpose="The decision engine creates auditable decision-link nodes that connect actors to operational context in the graph.",
                status=stage_status(ready=decision_count > 0),
                summary=(
                    f"{decision_count} decision records are active in the current runtime."
                    if decision_count
                    else "Decision generation has not created any nodes yet."
                ),
                operations=[
                    "Decision generation",
                    "Actor linkage",
                    "Context attachment",
                ],
                metrics=[
                    metric("Decisions", decision_count),
                    metric("Tracked actors", employee_count),
                ],
                subprocesses=[
                    subprocess(
                        "Decision generation",
                        "DecisionEngine.generate() builds the decision records consumed by the graph builder.",
                        status=stage_status(ready=decision_count > 0),
                        audit_trace="DecisionEngine.generate",
                        evidence_refs=[str(decision_count)],
                    ),
                    subprocess(
                        "Decision linking",
                        "Decision nodes connect to employees and related business entities when the target IDs exist in graph context.",
                        status=stage_status(ready=decision_count > 0),
                        audit_trace="DECISION_LINK edges",
                        evidence_refs=["Decision"],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="rules",
                title="Governance Rule Engine",
                short_title="Rules",
                purpose="Rule execution detects triggered control failures and materializes rule nodes in the graph for explainability.",
                status=stage_status(ready=bool(dataset), attention=rule_count > 0),
                summary=(
                    f"{rule_count} rule result(s) are active in the current run."
                    if rule_count
                    else "Rules have not been executed yet for the current runtime."
                ),
                operations=[
                    "Native governance rules",
                    "Policy-derived rules",
                    "Rule deduplication",
                    "Rule-node graph rebuild",
                ],
                metrics=[
                    metric("Triggered", rule_count),
                    metric("Risk level", state.get("risk_level", "LOW")),
                ],
                subprocesses=[
                    subprocess(
                        "Rule execution",
                        "GovernanceRuleEngine.run() and policy-derived rules are merged and deduplicated by rule_id.",
                        status=stage_status(ready=rule_count > 0, attention=rule_count > 0),
                        audit_trace="RuntimeContainer.run_rules",
                        evidence_refs=[str(rule_count)],
                    ),
                    subprocess(
                        "Rule nodes",
                        "Triggered rules become RULE:* nodes connected to the operational nodes that caused them.",
                        status=stage_status(ready=rule_count > 0),
                        audit_trace="DigitalTwinGraphBuilder.add_rule_results",
                        evidence_refs=[f"RULE:{result.rule_id}" for result in self.rule_results[:3]],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="pathway",
                title="Control Bypass Pathway Detector",
                short_title="Pathway",
                purpose="Pathway detection correlates graph paths and triggered rules into case records that auditors can investigate.",
                status=stage_status(ready=bool(dataset), attention=bool(visible_cases)),
                summary=(
                    f"{len(visible_cases)} visible case(s) are currently available with {total_exposure:.2f} total exposure in scope."
                    if visible_cases
                    else "No visible cases are currently published for this viewer."
                ),
                operations=[
                    "Path search",
                    "Rule correlation",
                    "Trust scoring",
                    "Case persistence",
                ],
                metrics=[
                    metric("Visible cases", len(visible_cases)),
                    metric("Exposure", total_exposure),
                    metric("Risk band", state.get("risk_level", "LOW")),
                ],
                subprocesses=[
                    subprocess(
                        "Case generation",
                        "PathwayDetector.detect() creates case records and persists them when an admin publishes pathway results.",
                        status=stage_status(ready=bool(self.cases), attention=bool(visible_cases)),
                        audit_trace="RuntimeContainer.detect_pathways",
                        evidence_refs=[case.case_id for case in visible_cases[:3]],
                    ),
                    subprocess(
                        "Visibility guard",
                        "Admin-only cases remain hidden from auditors while shared cases stay explorable in graph and case lists.",
                        status=stage_status(ready=bool(self.cases), attention=viewer_role != "admin" and len(visible_cases) < len(self.cases)),
                        audit_trace="RuntimeContainer._visible_cases",
                        evidence_refs=[viewer_role, str(len(visible_cases))],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="risk",
                title="Risk Scoring & Trust Engine",
                short_title="Risk",
                purpose="Trust scoring converts correlated rule/path evidence into ranked case severity for triage and prioritization.",
                status=stage_status(ready=bool(dataset), attention=bool(visible_cases)),
                summary=(
                    f"Highest visible risk band is {state.get('risk_level', 'LOW')}."
                    if dataset
                    else "Risk scoring becomes active once rule and pathway processing has data."
                ),
                operations=[
                    "Risk band calibration",
                    "Trust score ranking",
                    "Case ordering",
                ],
                metrics=[
                    metric("Highest band", state.get("risk_level", "LOW")),
                    metric("Cases ranked", len(visible_cases)),
                ],
                subprocesses=[
                    subprocess(
                        "Trust score engine",
                        "TrustScoreEngine computes trust_score and risk_level used to sort pathway cases.",
                        status=stage_status(ready=bool(visible_cases), attention=bool(visible_cases)),
                        audit_trace="TrustScoreEngine.compute",
                        evidence_refs=[case.risk_level for case in visible_cases[:3]],
                    ),
                    subprocess(
                        "Risk band projection",
                        "SecureAIInferenceEngine.risk_band() projects aggregate scores into LOW/MEDIUM/HIGH/CRITICAL buckets.",
                        status=stage_status(ready=bool(dataset)),
                        audit_trace="SecureAIInferenceEngine.risk_band",
                        evidence_refs=[str(state.get("risk_level", "LOW"))],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="investigation",
                title="Investigation Case Engine",
                short_title="Investigate",
                purpose="Investigation reports synthesize case paths, actors, rules, and explanations into an auditor-facing narrative.",
                status=stage_status(ready=bool(visible_cases), attention=investigation_count > 0),
                summary=(
                    f"{investigation_count} investigation report(s) are cached in runtime memory."
                    if investigation_count
                    else "Investigations are generated on demand when a case is opened."
                ),
                operations=[
                    "Investigation generation",
                    "Case timeline lookup",
                    "Evidence bundle export",
                ],
                metrics=[
                    metric("Open cases", len([case for case in visible_cases if case.status != "closed"])),
                    metric("Investigations", investigation_count),
                ],
                subprocesses=[
                    subprocess(
                        "On-demand reports",
                        "generate_investigation() restores stored cases when needed and builds the investigation narrative per case.",
                        status=stage_status(ready=bool(visible_cases)),
                        audit_trace="RuntimeContainer.generate_investigation",
                        evidence_refs=[case.case_id for case in visible_cases[:3]],
                    ),
                    subprocess(
                        "Status history",
                        f"Case status history currently stores {state.get('storage_counts', {}).get('case_status_events', 0)} event(s).",
                        status=stage_status(ready=state.get("storage_counts", {}).get("case_status_events", 0) > 0),
                        audit_trace="RuntimeContainer.list_case_status_timeline",
                        evidence_refs=[str(state.get("storage_counts", {}).get("case_status_events", 0))],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="evidence",
                title="Evidence & Reporting Layer",
                short_title="Evidence",
                purpose="The prototype can export signed evidence bundles and now persists the report writer draft through the backend.",
                status=stage_status(ready=bool(visible_cases or report_draft_count), attention=report_draft_count > 0),
                summary=(
                    f"{report_draft_count} persisted report draft(s) and {state.get('storage_counts', {}).get('investigations', 0)} stored investigation payload(s) are available."
                ),
                operations=[
                    "Evidence zip export",
                    "Signed manifest generation",
                    "Draft report persistence",
                ],
                metrics=[
                    metric("Drafts", report_draft_count),
                    metric("Investigations stored", state.get("storage_counts", {}).get("investigations", 0)),
                ],
                subprocesses=[
                    subprocess(
                        "Evidence bundle export",
                        "export_evidence_bundle() packages case JSON, investigation JSON, and a signed manifest into a zip.",
                        status=stage_status(ready=bool(visible_cases)),
                        audit_trace="RuntimeContainer.export_evidence_bundle",
                        evidence_refs=["case.json", "investigation.json", "manifest.json"],
                    ),
                    subprocess(
                        "Draft persistence",
                        "GET /reports/draft and PUT /reports/draft now load and save the auditor report draft through SQLite persistence.",
                        status=stage_status(ready=True, attention=report_draft_count > 0),
                        audit_trace="PersistentStore.get_report_draft / upsert_report_draft",
                        evidence_refs=["/reports/draft", str(report_draft_count)],
                    ),
                ],
            ),
            PipelineStageDetail(
                stage_id="monitoring",
                title="Runtime Monitoring",
                short_title="Monitor",
                purpose="Operational telemetry, audit trail events, and persistent event logs expose what the prototype is doing right now.",
                status=stage_status(ready=bool(recent_events or persistent_events), attention=bool(latest_event)),
                summary=(
                    f"Latest event: {latest_event.get('event_type')} by {latest_event.get('actor')}"
                    if latest_event
                    else "No runtime events have been recorded yet."
                ),
                operations=[
                    "System state snapshot",
                    "Metrics registry snapshot",
                    "Recent event stream",
                    "Persistent audit log",
                ],
                metrics=[
                    metric("Recent runtime events", len(recent_events)),
                    metric("Persistent log entries", len(persistent_events)),
                    metric("Audit chain", "valid" if state.get("audit_chain_valid") else "invalid"),
                ],
                subprocesses=[
                    subprocess(
                        "Recent event tracker",
                        "Recent in-memory events reflect the latest graph, case, and reporting activity visible to the current user.",
                        status=stage_status(ready=bool(recent_events), attention=bool(recent_events)),
                        audit_trace=str(latest_event.get("event_type", "none")) if latest_event else "none",
                        evidence_refs=recent_event_types[:3],
                    ),
                    subprocess(
                        "Persistent event log",
                        "SQLite-backed system events provide a longer audit trail beyond the in-memory event window.",
                        status=stage_status(ready=bool(persistent_events)),
                        audit_trace=str(latest_persistent.get("event_type", "none")) if latest_persistent else "none",
                        evidence_refs=[str(item.get("event_type", "")) for item in persistent_events[:3]],
                    ),
                ],
            ),
        ]
        response = PipelineDeepDiveResponse(
            generated_at=datetime.now(timezone.utc),
            stages=stages,
            vendor_names=[vendor.name for vendor in (dataset.vendors[:8] if dataset else [])],
            actor_names=[employee.name for employee in (dataset.employees[:8] if dataset else [])],
        )
        self._record(
            "pipeline_deep_dive_requested",
            actor=actor,
            details={
                "viewer_role": viewer_role,
                "stages": len(stages),
                "visible_cases": len(visible_cases),
            },
        )
        return response

    def get_report_draft(self, *, actor: str) -> ReportDraftResponse:
        payload = self.store.get_report_draft("auditor_report_draft") or {}
        updated_at = _parse_dt(payload.get("updated_at")) or datetime.now(timezone.utc)
        response = ReportDraftResponse(
            report_id=str(payload.get("report_id", "auditor_report_draft")),
            content=str(payload.get("content", "")),
            updated_at=updated_at,
            updated_by=str(payload.get("updated_by", actor)),
        )
        self._record(
            "report_draft_requested",
            actor=actor,
            details={"report_id": response.report_id, "has_content": bool(response.content.strip())},
        )
        return response

    def save_report_draft(self, payload: ReportDraftPayload, *, actor: str) -> ReportDraftResponse:
        updated_at = datetime.now(timezone.utc)
        record = {
            "report_id": "auditor_report_draft",
            "updated_by": actor,
            "content": payload.content,
            "updated_at": updated_at.isoformat(),
        }
        self.store.upsert_report_draft(record)
        response = ReportDraftResponse(
            report_id="auditor_report_draft",
            content=payload.content,
            updated_at=updated_at,
            updated_by=actor,
        )
        self._record(
            "report_draft_saved",
            actor=actor,
            details={"report_id": response.report_id, "content_length": len(payload.content)},
        )
        return response

    def get_graph_payload(self, *, actor: str, viewer_role: str) -> Dict[str, Any]:
        payload = graph_to_payload(self.graph)
        if viewer_role != "admin":
            hidden_case_ids = {case.case_id for case in self.cases.values() if case.visibility == "admin_only"}
            if hidden_case_ids:
                payload["nodes"] = [node for node in payload["nodes"] if node.get("id") not in hidden_case_ids]
                payload["edges"] = [
                    edge
                    for edge in payload["edges"]
                    if edge.get("source") not in hidden_case_ids and edge.get("target") not in hidden_case_ids
                ]
                payload["risk_nodes"] = [node_id for node_id in payload["risk_nodes"] if node_id not in hidden_case_ids]
                payload["cases"] = [case_id for case_id in payload["cases"] if case_id not in hidden_case_ids]
                node_types = Counter()
                for node in payload["nodes"]:
                    node_types[str(node.get("type", "Unknown"))] += 1
                payload["node_types"] = dict(node_types)

        payload["cases"] = [case.case_id for case in self._visible_cases(viewer_role)]
        self._record(
            "graph_requested",
            actor=actor,
            details={"nodes": len(payload["nodes"]), "edges": len(payload["edges"]), "viewer_role": viewer_role},
        )
        return payload

    def get_system_state(self, *, actor: str, viewer_role: str) -> Dict[str, Any]:
        state = self.system_monitor.state_snapshot(self)
        if viewer_role != "admin":
            visible_cases = self._visible_cases(viewer_role)
            max_score = max((case.trust_score for case in visible_cases), default=0.0)
            storage_counts = dict(state.get("storage_counts", {}))
            storage_counts["auditor_alerts"] = 0
            state["storage_counts"] = storage_counts
            state["cases_detected"] = len(visible_cases)
            state["risk_level"] = self.secure_ai.risk_band(max_score)
        else:
            state["admin_alerts"] = len(self.auditor_alerts)
        self._record(
            "system_state_requested",
            actor=actor,
            details={"viewer_role": viewer_role, "risk_level": state.get("risk_level")},
        )
        return state

    def get_system_metrics(self, *, actor: str, viewer_role: str) -> Dict[str, Any]:
        metrics = self.metrics.snapshot()
        payload = {
            "metrics": metrics,
            "recent_events": self.event_tracker.recent(limit=50),
            "recent_audit_logs": self.audit_logger.recent_events(limit=50),
            "persistent_event_log": self.store.recent_events(limit=50),
            "backups": self.backup_manager.latest_backups(limit=10),
        }
        if viewer_role != "admin":
            hidden_events = {"auditor_alert_created", "auditor_alerts_viewed"}

            def _visible_event(event: Dict[str, Any]) -> bool:
                event_type = str(event.get("event_type", ""))
                details = event.get("details")
                if not isinstance(details, dict):
                    details = event.get("payload", {})
                if event_type in hidden_events:
                    return False
                if event_type == "case_created" and isinstance(details, dict):
                    return details.get("visibility") != "admin_only"
                return True

            payload["recent_events"] = [event for event in payload["recent_events"] if _visible_event(event)]
            payload["recent_audit_logs"] = [event for event in payload["recent_audit_logs"] if _visible_event(event)]
            payload["persistent_event_log"] = [
                event for event in payload["persistent_event_log"] if _visible_event(event)
            ]

        self._record(
            "system_metrics_requested",
            actor=actor,
            details={"viewer_role": viewer_role},
        )
        return payload

    def backup_now(self, *, actor: str) -> Dict[str, Any]:
        payload = self.backup_manager.create_backup(
            "manual",
            [self.store.database_path, self.settings.audit_log_path],
        )
        self.metrics.increment("backup_runs", 1)
        self._record(
            "manual_backup_completed",
            actor=actor,
            details={"backup_dir": payload["backup_dir"], "copied_files": len(payload["copied_files"])},
        )
        return payload

    def restore_backup(self, backup_dir: str, mode: str, *, actor: str) -> BackupRestoreResponse:
        try:
            payload = self.backup_manager.restore_backup(
                backup_dir,
                [self.store.database_path, self.settings.audit_log_path],
                mode=mode,
            )
        except FileNotFoundError as exc:
            raise HTTPException(status_code=404, detail=str(exc)) from exc
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from exc

        self._record(
            "backup_restore_executed",
            actor=actor,
            details={
                "backup_dir": backup_dir,
                "mode": mode,
                "restored_files": len(payload["restored_files"]),
                "missing_files": len(payload["missing_files"]),
            },
        )
        return BackupRestoreResponse.model_validate(payload)


_container: Optional[RuntimeContainer] = None


def get_container() -> RuntimeContainer:
    global _container
    if _container is None:
        _container = RuntimeContainer()
    return _container


def get_current_user(
    token: str = Depends(oauth2_scheme),
    container: RuntimeContainer = Depends(get_container),
) -> Dict[str, str]:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = decode_access_token(token, container.settings)
    except ValueError as exc:
        raise credentials_exception from exc

    username = payload.get("username")
    if not username:
        raise credentials_exception

    user_record = container.store.get_user(username)
    if not user_record or int(user_record.get("is_active", 0)) != 1:
        raise credentials_exception
    if container.store.is_user_locked(username):
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account locked until {user_record.get('locked_until')}",
        )

    return {"username": username, "role": str(user_record["role"])}
