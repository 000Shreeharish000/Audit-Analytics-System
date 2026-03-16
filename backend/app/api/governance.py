from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import (
    AuditorAlert,
    AuditorAssignmentRequest,
    AuditorAssignmentResult,
    CaseResult,
    CaseStatusEvent,
    CaseStatusUpdateRequest,
    CompanyPolicyDocumentSummary,
    CompanyPolicyManualUpdateRequest,
    CompanyPolicyManualUpdateResponse,
    CompanyPolicyProfile,
    CompanyPolicyPublishRequest,
    CompanyPolicyUpsertRequest,
    CompanyPolicyVersionSummary,
    CompanyPolicyWorkspaceResponse,
    CounterpartyOnboardingRequest,
    CounterpartyRecord,
)
from app.security.rbac import require_roles

router = APIRouter(prefix="/governance", tags=["governance"])


@router.post("/policies", response_model=CompanyPolicyProfile)
def upsert_policy(
    payload: CompanyPolicyUpsertRequest,
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> CompanyPolicyProfile:
    return container.upsert_company_policy(payload, actor=current_user["username"])


@router.get("/policies/{company_id}", response_model=CompanyPolicyProfile)
def get_policy(
    company_id: str,
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> CompanyPolicyProfile:
    return container.get_company_policy(company_id)


@router.get("/policies", response_model=list[CompanyPolicyProfile])
def list_policies(
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> list[CompanyPolicyProfile]:
    return container.list_company_policies()


@router.get("/policies/{company_id}/versions", response_model=list[CompanyPolicyVersionSummary])
def list_policy_versions(
    company_id: str,
    current_user: dict = Depends(require_roles("admin", "risk_analyst", "auditor")),
    container: RuntimeContainer = Depends(get_container),
) -> list[CompanyPolicyVersionSummary]:
    return container.list_policy_versions(company_id)


@router.get("/policies/{company_id}/versions/{version}", response_model=CompanyPolicyProfile)
def get_policy_version(
    company_id: str,
    version: int,
    current_user: dict = Depends(require_roles("admin", "risk_analyst", "auditor")),
    container: RuntimeContainer = Depends(get_container),
) -> CompanyPolicyProfile:
    return container.get_policy_version(company_id, version)


@router.get("/policies/{company_id}/workspace", response_model=CompanyPolicyWorkspaceResponse)
def get_policy_workspace(
    company_id: str,
    current_user: dict = Depends(require_roles("admin", "risk_analyst", "auditor")),
    container: RuntimeContainer = Depends(get_container),
) -> CompanyPolicyWorkspaceResponse:
    return container.get_policy_workspace(company_id, actor=current_user["username"])


@router.post("/policies/{company_id}/manual-update", response_model=CompanyPolicyManualUpdateResponse)
def save_manual_policy_update(
    company_id: str,
    payload: CompanyPolicyManualUpdateRequest,
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> CompanyPolicyManualUpdateResponse:
    return container.save_manual_policy_update(company_id, payload, actor=current_user["username"])


@router.post("/policies/{company_id}/publish", response_model=CompanyPolicyProfile)
def publish_policy_version(
    company_id: str,
    payload: CompanyPolicyPublishRequest,
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> CompanyPolicyProfile:
    return container.publish_company_policy(company_id, payload, actor=current_user["username"])


@router.post("/policies/{company_id}/rules/upload")
async def upload_policy_rules(
    company_id: str,
    source: str = Form(...),
    enrich_government: bool = Form(True),
    files: list[UploadFile] = File(...),
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> Dict[str, Any]:
    if not files:
        raise HTTPException(status_code=422, detail="At least one file is required")

    results = []
    for upload in files:
        content = await upload.read()
        results.append(
            container.ingest_policy_document(
                company_id=company_id,
                source=source,
                filename=upload.filename or "uploaded_document",
                content=content,
                actor=current_user["username"],
                enrich_government=enrich_government,
            )
        )
    return {"company_id": company_id, "documents": results}


@router.get("/policies/{company_id}/documents", response_model=list[CompanyPolicyDocumentSummary])
def list_policy_documents(
    company_id: str,
    limit: int = 20,
    current_user: dict = Depends(require_roles("admin", "risk_analyst", "auditor")),
    container: RuntimeContainer = Depends(get_container),
) -> list[CompanyPolicyDocumentSummary]:
    return container.list_policy_documents(company_id, actor=current_user["username"], limit=limit)


@router.post("/counterparties", response_model=CounterpartyRecord)
def onboard_counterparty(
    payload: CounterpartyOnboardingRequest,
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> CounterpartyRecord:
    return container.onboard_counterparty(payload, actor=current_user["username"])


@router.get("/counterparties/{company_id}", response_model=list[CounterpartyRecord])
def list_counterparties(
    company_id: str,
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> list[CounterpartyRecord]:
    return container.list_counterparties(company_id, actor=current_user["username"])


@router.post("/assignments", response_model=AuditorAssignmentResult)
def assign_auditor(
    payload: AuditorAssignmentRequest,
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> AuditorAssignmentResult:
    return container.assign_auditor(payload, actor=current_user["username"])


@router.get("/assignments/{company_id}", response_model=list[AuditorAssignmentResult])
def list_assignments(
    company_id: str,
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> list[AuditorAssignmentResult]:
    return container.list_auditor_assignments(company_id, actor=current_user["username"])


@router.get("/alerts/{company_id}", response_model=list[AuditorAlert])
def list_alerts(
    company_id: str,
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> list[AuditorAlert]:
    return container.list_auditor_alerts(company_id, actor=current_user["username"])


@router.post("/cases/{case_id}/status", response_model=CaseResult)
def update_case_status(
    case_id: str,
    payload: CaseStatusUpdateRequest,
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> CaseResult:
    return container.update_case_status(case_id, payload, actor=current_user["username"])


@router.get("/cases/{case_id}/status", response_model=list[CaseStatusEvent])
def get_case_status_timeline(
    case_id: str,
    current_user: dict = Depends(require_roles("admin", "risk_analyst", "auditor")),
    container: RuntimeContainer = Depends(get_container),
) -> list[CaseStatusEvent]:
    return container.list_case_status_timeline(
        case_id,
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )
