from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import CaseResult
from app.security.rbac import require_roles

router = APIRouter(tags=["pathways"])


@router.get("/pathways", response_model=list[CaseResult])
def detect_pathways(
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> list[CaseResult]:
    return container.detect_pathways(
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )
