from __future__ import annotations

from datetime import datetime, timezone
import hashlib
import io
import json
from pathlib import Path
import zipfile

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient

from app.api.manual_audit import (
    ManualAuditRequest,
    create_manual_audit,
    list_manual_audits,
)
from app import dependencies as deps
from app.main import create_app
from app.models.approval import Approval
from app.models.decision import (
    AuditorAssignmentRequest,
    CaseStatusUpdateRequest,
    CompanyPolicyManualUpdateRequest,
    CompanyPolicyPublishRequest,
    CompanyPolicyUpsertRequest,
    CompanyThresholds,
    CounterpartyOnboardingRequest,
    DatasetPayload,
    ReportDraftPayload,
)
from app.models.employee import Employee
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.vendor import Vendor


def _load_dataset() -> DatasetPayload:
    dataset_path = (
        Path(__file__).resolve().parents[1]
        / "app"
        / "data"
        / "simulated_enterprise_dataset.json"
    )
    with dataset_path.open("r", encoding="utf-8") as file:
        return DatasetPayload.model_validate(json.load(file))


@pytest.fixture()
def container(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> deps.RuntimeContainer:
    monkeypatch.setenv("DATABASE_PATH", str(tmp_path / "state.db"))
    monkeypatch.setenv("AUDIT_LOG_PATH", str(tmp_path / "audit.jsonl"))
    monkeypatch.setenv("BACKUP_DIR", str(tmp_path / "backups"))
    monkeypatch.setenv("DATA_ENCRYPTION_KEY", "integration-test-secret")
    monkeypatch.setenv("AUDIT_HMAC_KEY", "integration-audit-secret")
    monkeypatch.setenv("ENABLE_EXTERNAL_AI", "false")
    deps._container = None
    return deps.RuntimeContainer()


def _login_headers(client: TestClient, username: str, password: str) -> dict[str, str]:
    response = client.post(
        "/auth/login",
        json={"username": username, "password": password},
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def test_policy_versioning_publish_and_threshold_effect(container: deps.RuntimeContainer) -> None:
    draft_v1 = container.upsert_company_policy(
        CompanyPolicyUpsertRequest(
            company_id="ACME",
            company_name="Acme Corp",
            thresholds=CompanyThresholds(
                invoice_approval_threshold=500000,
                high_value_payment_threshold=1200000,
                required_high_value_approvals=2,
                max_connection_hops=2,
                conflict_reassign_limit=0.65,
            ),
            compliance_tags=["pilot"],
        ),
        actor="admin",
    )
    assert draft_v1.status == "draft"
    assert draft_v1.version == 1

    dataset = _load_dataset().model_copy(update={"company_id": "ACME"}, deep=True)
    with pytest.raises(HTTPException):
        container.ingest_dataset(dataset, actor="admin", source="unit_test")

    container.publish_company_policy(
        "ACME",
        CompanyPolicyPublishRequest(version=draft_v1.version, approval_note="initial publish"),
        actor="admin",
    )
    container.ingest_dataset(dataset, actor="admin", source="unit_test")
    high_threshold_rules = {result.rule_id for result in container.run_rules(actor="admin")}
    assert "RULE_JUST_BELOW_THRESHOLD_INVOICES" not in high_threshold_rules

    draft_v2 = container.upsert_company_policy(
        CompanyPolicyUpsertRequest(
            company_id="ACME",
            company_name="Acme Corp",
            thresholds=CompanyThresholds(
                invoice_approval_threshold=300000,
                high_value_payment_threshold=1000000,
                required_high_value_approvals=2,
                max_connection_hops=2,
                conflict_reassign_limit=0.65,
            ),
            compliance_tags=["pilot"],
        ),
        actor="admin",
    )
    assert draft_v2.status == "draft"
    assert draft_v2.version == 2

    container.publish_company_policy(
        "ACME",
        CompanyPolicyPublishRequest(version=draft_v2.version, approval_note="updated limits"),
        actor="admin",
    )
    low_threshold_rules = {result.rule_id for result in container.run_rules(actor="admin")}
    assert "RULE_JUST_BELOW_THRESHOLD_INVOICES" in low_threshold_rules

    versions = container.list_policy_versions("ACME")
    assert {item.version for item in versions} == {1, 2}


def test_admin_manual_policy_update_creates_draft_document_and_auditor_can_view_workspace(container: deps.RuntimeContainer) -> None:
    response = container.save_manual_policy_update(
        "DEFAULT",
        CompanyPolicyManualUpdateRequest(
            company_name="Default Corp",
            source="government",
            title="Quarterly compliance uplift",
            content="All high value payments shall undergo compliance review and dual authorization.",
            thresholds=CompanyThresholds(
                invoice_approval_threshold=450000,
                high_value_payment_threshold=900000,
                required_high_value_approvals=2,
                max_connection_hops=3,
                conflict_reassign_limit=0.6,
            ),
            compliance_tags=["rbi", "aml"],
            enrich_government=False,
        ),
        actor="admin",
    )

    assert response.company_id == "DEFAULT"
    assert response.document_title == "Quarterly compliance uplift"
    assert response.rules_added >= 1
    assert response.updated_thresholds is True
    assert response.requires_publish is True

    workspace = container.get_policy_workspace("DEFAULT", actor="auditor")
    assert workspace.draft_policy is not None
    assert workspace.draft_policy.thresholds.high_value_payment_threshold == 900000
    assert any(item.filename == "Quarterly compliance uplift.txt" for item in workspace.documents)

    metrics = container.get_system_metrics(actor="admin", viewer_role="admin")
    assert any(event.get("event_type") == "policy_manual_update_saved" for event in metrics["recent_events"])
    assert any(event.get("event_type") == "policy_manual_update_saved" for event in metrics["persistent_event_log"])


def test_policy_mutation_routes_are_admin_only_and_auditor_workspace_stays_read_only(
    container: deps.RuntimeContainer,
) -> None:
    deps._container = container

    manual_update_payload = {
        "company_name": "Default Corp",
        "source": "government",
        "title": "Quarterly compliance uplift",
        "content": "All high value payments shall undergo compliance review and dual authorization.",
        "thresholds": {
            "invoice_approval_threshold": 450000,
            "high_value_payment_threshold": 900000,
            "required_high_value_approvals": 2,
            "max_connection_hops": 3,
            "conflict_reassign_limit": 0.6,
        },
        "compliance_tags": ["rbi", "aml"],
        "enrich_government": False,
    }
    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Length 86 >>\nstream\nBT /F1 12 Tf 72 720 Td (Government policy shall preserve audit evidence and compliance logs.) Tj ET\nendstream\nendobj\n%%EOF"

    with TestClient(create_app()) as client:
        admin_headers = _login_headers(client, "admin", "Admin@12345")
        auditor_headers = _login_headers(client, "auditor", "Auditor@12345")

        admin_update = client.post(
            "/governance/policies/DEFAULT/manual-update",
            headers=admin_headers,
            json=manual_update_payload,
        )
        assert admin_update.status_code == 200

        workspace = client.get(
            "/governance/policies/DEFAULT/workspace",
            headers=auditor_headers,
        )
        assert workspace.status_code == 200
        assert workspace.json()["draft_policy"]["thresholds"]["high_value_payment_threshold"] == 900000

        auditor_update = client.post(
            "/governance/policies/DEFAULT/manual-update",
            headers=auditor_headers,
            json=manual_update_payload,
        )
        assert auditor_update.status_code == 403

        admin_upload = client.post(
            "/governance/policies/DEFAULT/rules/upload",
            headers=admin_headers,
            data={"source": "government", "enrich_government": "false"},
            files=[("files", ("compliance-update.pdf", pdf_bytes, "application/pdf"))],
        )
        assert admin_upload.status_code == 200

        auditor_upload = client.post(
            "/governance/policies/DEFAULT/rules/upload",
            headers=auditor_headers,
            data={"source": "government", "enrich_government": "false"},
            files=[("files", ("compliance-update.pdf", pdf_bytes, "application/pdf"))],
        )
        assert auditor_upload.status_code == 403


def test_policy_document_pdf_ingestion_extracts_rules(container: deps.RuntimeContainer) -> None:
    container.save_manual_policy_update(
        "PDFCO",
        CompanyPolicyManualUpdateRequest(
            company_name="Pdf Co",
            title="Initial baseline",
            content="Baseline governance policy shall remain active.",
            thresholds=CompanyThresholds(
                invoice_approval_threshold=500000,
                high_value_payment_threshold=1000000,
                required_high_value_approvals=2,
                max_connection_hops=2,
                conflict_reassign_limit=0.65,
            ),
            enrich_government=False,
        ),
        actor="admin",
    )

    pdf_bytes = b"%PDF-1.4\n1 0 obj\n<< /Length 86 >>\nstream\nBT /F1 12 Tf 72 720 Td (Government policy shall preserve audit evidence and compliance logs.) Tj ET\nendstream\nendobj\n%%EOF"
    result = container.ingest_policy_document(
        company_id="PDFCO",
        source="government",
        filename="compliance-update.pdf",
        content=pdf_bytes,
        actor="admin",
        enrich_government=False,
    )

    assert result["rules_extracted"] >= 1
    documents = container.list_policy_documents("PDFCO", actor="admin")
    assert any(item["filename"] == "compliance-update.pdf" for item in documents)


def test_policy_document_multiclause_pdf_extracts_multiple_rules(container: deps.RuntimeContainer) -> None:
    container.save_manual_policy_update(
        "PDFMULTI",
        CompanyPolicyManualUpdateRequest(
            company_name="Pdf Multi Co",
            title="Initial baseline",
            content="Baseline governance policy shall remain active.",
            thresholds=CompanyThresholds(
                invoice_approval_threshold=500000,
                high_value_payment_threshold=1000000,
                required_high_value_approvals=2,
                max_connection_hops=2,
                conflict_reassign_limit=0.65,
            ),
            enrich_government=False,
        ),
        actor="admin",
    )

    pdf_bytes = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Length 278 >>\nstream\n"
        b"BT /F1 12 Tf 72 720 Td 16 TL "
        b"(Section 1. Vendor creation shall be approved by a separate employee.) Tj "
        b"T* (Section 2. High value payments shall require dual authorization.) Tj "
        b"T* (Section 3. Compliance logs must be preserved for audit review.) Tj ET\n"
        b"endstream\nendobj\n%%EOF"
    )
    result = container.ingest_policy_document(
        company_id="PDFMULTI",
        source="government",
        filename="multiclause-law.pdf",
        content=pdf_bytes,
        actor="admin",
        enrich_government=False,
    )

    assert result["rules_extracted"] >= 3
    workspace = container.get_policy_workspace("PDFMULTI", actor="admin")
    assert workspace.draft_policy is not None
    assert len(workspace.draft_policy.rules) >= 3


def test_system_state_policy_rule_count_tracks_uploaded_laws(container: deps.RuntimeContainer) -> None:
    dataset = _load_dataset()
    container.ingest_dataset(dataset, actor="admin", source="unit_test")

    container.save_manual_policy_update(
        dataset.company_id,
        CompanyPolicyManualUpdateRequest(
            company_name="Default Corp",
            source="government",
            title="Baseline governance policy",
            content="High value payments shall undergo compliance review and dual authorization.",
            thresholds=CompanyThresholds(
                invoice_approval_threshold=450000,
                high_value_payment_threshold=900000,
                required_high_value_approvals=2,
                max_connection_hops=3,
                conflict_reassign_limit=0.6,
            ),
            enrich_government=False,
        ),
        actor="admin",
    )
    baseline_state = container.get_system_state(actor="admin", viewer_role="admin")
    baseline_rules = baseline_state["policy_rules_in_scope"]

    pdf_bytes = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<< /Length 278 >>\nstream\n"
        b"BT /F1 12 Tf 72 720 Td 16 TL "
        b"(Section 1. Vendor creation shall be approved by a separate employee.) Tj "
        b"T* (Section 2. High value payments shall require dual authorization.) Tj "
        b"T* (Section 3. Compliance logs must be preserved for audit review.) Tj ET\n"
        b"endstream\nendobj\n%%EOF"
    )
    result = container.ingest_policy_document(
        company_id=dataset.company_id,
        source="government",
        filename="telemetry-law.pdf",
        content=pdf_bytes,
        actor="admin",
        enrich_government=False,
    )

    updated_state = container.get_system_state(actor="admin", viewer_role="admin")
    assert updated_state["policy_rules_in_scope"] == result["total_policy_rules"]
    assert updated_state["policy_rules_in_scope"] > baseline_rules


def test_run_rules_uses_latest_draft_policy_after_manual_sync(container: deps.RuntimeContainer) -> None:
    dataset = _load_dataset()
    container.ingest_dataset(dataset, actor="admin", source="unit_test")

    baseline_rule_ids = {result.rule_id for result in container.run_rules(actor="admin")}

    container.save_manual_policy_update(
        dataset.company_id,
        CompanyPolicyManualUpdateRequest(
            company_name="Default Corp",
            source="government",
            title="Vendor maker checker uplift",
            content="Vendor creation shall be approved by a separate employee and compliance logs shall be preserved for audit review.",
            enrich_government=False,
        ),
        actor="admin",
    )

    updated_results = container.run_rules(actor="admin")
    updated_rule_ids = {result.rule_id for result in updated_results}

    assert any(rule_id.startswith("GOV_DEFAULT_") for rule_id in updated_rule_ids)
    assert len(updated_rule_ids) > len(baseline_rule_ids)


def test_admin_only_cases_hidden_from_auditor_view(container: deps.RuntimeContainer) -> None:
    container.ingest_dataset(_load_dataset(), actor="admin", source="unit_test")
    container.run_rules(actor="admin")

    admin_cases = container.detect_pathways(actor="admin", viewer_role="admin")
    auditor_cases = container.detect_pathways(actor="auditor", viewer_role="auditor")
    alerts = container.list_auditor_alerts("DEFAULT", actor="admin")

    assert len(alerts) > 0
    assert any(case.visibility == "admin_only" for case in admin_cases)
    assert all(case.visibility == "shared" for case in auditor_cases)
    assert len(auditor_cases) < len(admin_cases)

    admin_graph = container.get_graph_payload(actor="admin", viewer_role="admin")
    auditor_graph = container.get_graph_payload(actor="auditor", viewer_role="auditor")
    assert len(auditor_graph["cases"]) < len(admin_graph["cases"])


def test_case_lifecycle_updates_and_timeline(container: deps.RuntimeContainer) -> None:
    container.ingest_dataset(_load_dataset(), actor="admin", source="unit_test")
    container.run_rules(actor="admin")
    cases = container.detect_pathways(actor="admin", viewer_role="admin")
    case_id = cases[0].case_id

    container.update_case_status(
        case_id,
        CaseStatusUpdateRequest(status="in_review", owner="risk_analyst", note="assigned to review"),
        actor="admin",
    )
    closed = container.update_case_status(
        case_id,
        CaseStatusUpdateRequest(status="closed", owner="risk_analyst", note="resolved", closed_reason="controls tightened"),
        actor="admin",
    )
    assert closed.status == "closed"
    assert closed.closed_reason == "controls tightened"

    timeline = container.list_case_status_timeline(case_id, actor="admin", viewer_role="admin")
    statuses = [event.status for event in timeline]
    assert statuses[0] == "open"
    assert "in_review" in statuses
    assert statuses[-1] == "closed"


def test_evidence_bundle_export_is_signed(container: deps.RuntimeContainer) -> None:
    container.ingest_dataset(_load_dataset(), actor="admin", source="unit_test")
    container.run_rules(actor="admin")
    cases = container.detect_pathways(actor="admin", viewer_role="admin")
    case_id = cases[0].case_id

    bundle_bytes, _, meta = container.export_evidence_bundle(
        case_id,
        actor="admin",
        viewer_role="admin",
        enhanced=True,
    )
    assert len(bundle_bytes) > 0
    assert len(meta.signature) == 64

    with zipfile.ZipFile(io.BytesIO(bundle_bytes), mode="r") as zipped:
        names = set(zipped.namelist())
        assert "case.json" in names
        assert "investigation.json" in names
        assert "manifest.json" in names
        manifest = json.loads(zipped.read("manifest.json").decode("utf-8"))
        case_hash = manifest["case.json"]
        actual_case_hash = hashlib.sha256(zipped.read("case.json")).hexdigest()
        assert case_hash == actual_case_hash


def test_why_not_flagged_reports_control_separation(container: deps.RuntimeContainer) -> None:
    dataset = _load_dataset().model_copy(deep=True)
    dataset.vendors.append(
        Vendor(
            vendor_id="V999",
            name="Safe Vendor Pvt Ltd",
            created_by="E103",
            created_at=datetime(2026, 2, 7, 9, 0, tzinfo=timezone.utc),
            approved_by="E100",
            approved_at=datetime(2026, 2, 7, 10, 0, tzinfo=timezone.utc),
        )
    )
    dataset.invoices.append(
        Invoice(
            invoice_id="I9999",
            vendor_id="V999",
            amount=80000,
            currency="INR",
            submitted_by="E103",
            created_at=datetime(2026, 2, 8, 9, 0, tzinfo=timezone.utc),
        )
    )
    dataset.approvals.append(
        Approval(
            approval_id="A9999",
            target_type="invoice",
            target_id="I9999",
            employee_id="E101",
            approved_at=datetime(2026, 2, 8, 10, 0, tzinfo=timezone.utc),
        )
    )
    dataset.payments.append(
        Payment(
            payment_id="P9999",
            invoice_id="I9999",
            vendor_id="V999",
            amount=80000,
            executed_by="E102",
            executed_at=datetime(2026, 2, 9, 9, 30, tzinfo=timezone.utc),
        )
    )
    container.ingest_dataset(dataset, actor="admin", source="unit_test")
    container.run_rules(actor="admin")
    container.detect_pathways(actor="admin", viewer_role="admin")

    response = container.explain_why_not_flagged("I9999", actor="admin", viewer_role="admin")
    assert response.currently_flagged is False
    assert any("Segregation of duties" in reason for reason in response.reasons)


def test_auditor_assignment_avoids_relationship_conflict(container: deps.RuntimeContainer) -> None:
    dataset = _load_dataset().model_copy(deep=True)
    dataset.employees.append(
        Employee(
            employee_id="E104",
            name="Priya Das",
            department="Internal Audit",
            role="Auditor",
            manager_id="E100",
        )
    )
    container.ingest_dataset(dataset, actor="admin", source="unit_test")

    assignment = container.assign_auditor(
        AuditorAssignmentRequest(company_id="DEFAULT", vendor_id="V300"),
        actor="admin",
    )
    assert assignment.auditor_id == "E104"
    assert assignment.conflict_score <= 0.1


def test_counterparty_onboarding_tracks_missing_documents(container: deps.RuntimeContainer) -> None:
    record = container.onboard_counterparty(
        CounterpartyOnboardingRequest(
            company_id="DEFAULT",
            counterparty_id="VEN-900",
            counterparty_type="vendor",
            name="Vertex Trade LLP",
            tax_identifier="GSTIN-22AAAAA0000A1Z5",
            country="IN",
            required_docs=["board_resolution", "bank_statement", "kyc"],
            provided_docs=["kyc", "bank_statement"],
            risk_notes="Pilot onboarding for services vendor",
        ),
        actor="admin",
    )
    assert record.missing_docs == ["board_resolution"]


def test_vendor_search_returns_exact_match_first(container: deps.RuntimeContainer) -> None:
    dataset = _load_dataset()
    container.ingest_dataset(dataset, actor="admin", source="unit_test")
    container.run_rules(actor="admin")
    container.detect_pathways(actor="admin", viewer_role="admin")

    vendor = dataset.vendors[0]
    response = container.search_vendors(vendor.vendor_id, actor="auditor", viewer_role="auditor")

    assert response.query == vendor.vendor_id
    assert response.results
    assert response.results[0].vendor_id == vendor.vendor_id
    assert response.results[0].invoice_count >= 0


def test_vendor_subgraph_scopes_graph_and_cases(container: deps.RuntimeContainer) -> None:
    dataset = _load_dataset()
    container.ingest_dataset(dataset, actor="admin", source="unit_test")
    container.run_rules(actor="admin")
    cases = container.detect_pathways(actor="admin", viewer_role="admin")

    case = next(item for item in cases if any(node.startswith("V") for node in item.path_nodes))
    vendor_id = next(node for node in case.path_nodes if node.startswith("V"))

    response = container.get_vendor_subgraph(
        vendor_id,
        risk_level=case.risk_level,
        actor="auditor",
        viewer_role="auditor",
    )

    assert response.summary.vendor_id == vendor_id
    assert any(str(node.get("id")) == vendor_id for node in response.graph["nodes"])
    assert response.matched_cases
    assert all(item.risk_level == case.risk_level for item in response.matched_cases)


def test_pipeline_deep_dive_exposes_runtime_stage_data(container: deps.RuntimeContainer) -> None:
    dataset = _load_dataset()
    container.ingest_dataset(dataset, actor="admin", source="unit_test")
    container.run_rules(actor="admin")
    container.detect_pathways(actor="admin", viewer_role="admin")
    container.save_report_draft(ReportDraftPayload(content="<p>Saved draft</p>"), actor="auditor")

    response = container.get_pipeline_deep_dive(actor="auditor", viewer_role="auditor")

    assert response.stages
    assert {stage.stage_id for stage in response.stages} >= {"sources", "rules", "monitoring"}
    assert response.vendor_names
    assert response.actor_names
    assert any(stage.subprocesses for stage in response.stages)


def test_report_draft_round_trip_persists_content(container: deps.RuntimeContainer) -> None:
    initial = container.get_report_draft(actor="auditor")
    assert initial.report_id == "auditor_report_draft"
    assert initial.content == ""

    saved = container.save_report_draft(ReportDraftPayload(content="<p>Prototype ready</p>"), actor="auditor")
    loaded = container.get_report_draft(actor="admin")

    assert saved.report_id == "auditor_report_draft"
    assert saved.content == "<p>Prototype ready</p>"
    assert loaded.content == "<p>Prototype ready</p>"
    assert loaded.updated_by == "auditor"


def test_manual_audit_create_and_visibility(container: deps.RuntimeContainer) -> None:
    alice_record = create_manual_audit(
        ManualAuditRequest(
            vendor_id="V300",
            case_ids=["CASE-001", "CASE-002"],
            severity="HIGH",
            notes="Escalated for human review due to linked approvals.",
            findings=["Approval chain requires closer inspection"],
            recommended_action="Hold payment until compliance sign-off.",
        ),
        current_user={"username": "auditor.alice", "role": "auditor"},
        container=container,
    )
    bob_record = create_manual_audit(
        ManualAuditRequest(
            vendor_id="V301",
            case_ids=["CASE-101"],
            severity="MEDIUM",
            notes="Secondary sample review.",
            findings=["Cross-check invoice packet"],
            recommended_action="Request supporting evidence.",
        ),
        current_user={"username": "auditor.bob", "role": "auditor"},
        container=container,
    )

    assert alice_record.audit_id.startswith("MAUDIT-")
    assert alice_record.auditor_id == "auditor.alice"
    assert alice_record.vendor_id == "V300"
    assert alice_record.case_ids == ["CASE-001", "CASE-002"]
    assert alice_record.findings == ["Approval chain requires closer inspection"]
    assert alice_record.recommended_action == "Hold payment until compliance sign-off."
    assert alice_record.status == "open"

    stored_records = container.store.list_manual_audits()
    assert {record["audit_id"] for record in stored_records} == {
        alice_record.audit_id,
        bob_record.audit_id,
    }

    alice_visible = list_manual_audits(
        current_user={"username": "auditor.alice", "role": "auditor"},
        container=container,
    )
    admin_visible = list_manual_audits(
        current_user={"username": "admin", "role": "admin"},
        container=container,
    )

    assert [record.audit_id for record in alice_visible] == [alice_record.audit_id]
    assert {record.audit_id for record in admin_visible} == {
        alice_record.audit_id,
        bob_record.audit_id,
    }


def test_backup_restore_preview(container: deps.RuntimeContainer) -> None:
    container.ingest_dataset(_load_dataset(), actor="admin", source="unit_test")
    backup = container.backup_now(actor="admin")
    restored = container.restore_backup(backup["backup_dir"], "preview", actor="admin")
    assert restored.mode == "preview"
    assert len(restored.restored_files) > 0
