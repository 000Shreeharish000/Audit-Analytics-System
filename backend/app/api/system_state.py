from __future__ import annotations

from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import BackupResponse, BackupRestoreRequest, BackupRestoreResponse, PipelineDeepDiveResponse
from app.security.rbac import require_roles

router = APIRouter(prefix="/system", tags=["system"])


@router.get("/state")
def get_system_state(
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> Dict[str, Any]:
    return container.get_system_state(
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )


@router.get("/metrics")
def get_system_metrics(
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> Dict[str, Any]:
    return container.get_system_metrics(
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )


@router.get("/pipeline/deep-dive", response_model=PipelineDeepDiveResponse)
def get_pipeline_deep_dive(
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> PipelineDeepDiveResponse:
    return container.get_pipeline_deep_dive(
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )


@router.get("/audit/verify")
def verify_audit_chain(
    current_user: dict = Depends(require_roles("admin", "auditor")),
    container: RuntimeContainer = Depends(get_container),
) -> Dict[str, Any]:
    status_payload = container.audit_logger.verify_chain()
    container.audit_logger.log(
        "audit_verification_requested",
        actor=current_user["username"],
        details=status_payload,
    )
    return status_payload


@router.post("/backup", response_model=BackupResponse)
def manual_backup(
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> BackupResponse:
    payload = container.backup_now(actor=current_user["username"])
    return BackupResponse.model_validate(payload)


@router.post("/backup/restore", response_model=BackupRestoreResponse)
def restore_backup(
    payload: BackupRestoreRequest,
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> BackupRestoreResponse:
    return container.restore_backup(
        payload.backup_dir,
        payload.mode,
        actor=current_user["username"],
    )
