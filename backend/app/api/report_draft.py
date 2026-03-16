from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import ReportDraftPayload, ReportDraftResponse
from app.security.rbac import require_roles

router = APIRouter(prefix="/reports", tags=["reports"])


@router.get("/draft", response_model=ReportDraftResponse)
def get_report_draft(
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> ReportDraftResponse:
    return container.get_report_draft(actor=current_user["username"])


@router.put("/draft", response_model=ReportDraftResponse)
def save_report_draft(
    payload: ReportDraftPayload,
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> ReportDraftResponse:
    return container.save_report_draft(payload, actor=current_user["username"])