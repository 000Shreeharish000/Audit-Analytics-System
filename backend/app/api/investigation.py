from __future__ import annotations

import io

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import AgentAnalysis, InvestigationReport
from app.security.rbac import require_roles

router = APIRouter(prefix="/investigation", tags=["investigation"])


@router.get("/{case_id}", response_model=InvestigationReport)
def get_investigation_report(
    case_id: str,
    enhanced: bool = False,
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> InvestigationReport:
    return container.generate_investigation(
        case_id,
        actor=current_user["username"],
        enhanced=enhanced,
        viewer_role=current_user["role"],
    )


@router.get("/{case_id}/agents", response_model=AgentAnalysis)
def get_agent_analysis(
    case_id: str,
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> AgentAnalysis:
    return container.run_agent_panel(
        case_id,
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )


@router.get("/{case_id}/bundle")
def export_investigation_bundle(
    case_id: str,
    enhanced: bool = True,
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> StreamingResponse:
    bundle_bytes, filename, _ = container.export_evidence_bundle(
        case_id,
        actor=current_user["username"],
        viewer_role=current_user["role"],
        enhanced=enhanced,
    )
    return StreamingResponse(
        io.BytesIO(bundle_bytes),
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
