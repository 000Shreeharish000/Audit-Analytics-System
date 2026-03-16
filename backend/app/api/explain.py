from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import WhyNotFlaggedResponse
from app.security.rbac import require_roles

router = APIRouter(prefix="/explain", tags=["explainability"])


@router.get("/{case_id}")
def explain_case(
    case_id: str,
    enhanced: bool = False,
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> dict:
    report = container.generate_investigation(
        case_id,
        actor=current_user["username"],
        enhanced=enhanced,
        viewer_role=current_user["role"],
    )
    return {
        "case_id": case_id,
        "summary": report.summary,
        "risk_explanation": report.risk_explanation,
        "counterfactual_analysis": report.counterfactual_analysis,
        "rules_triggered": report.rules_triggered,
        "traceability": report.traceability,
    }


@router.get("/why-not-flagged/invoice/{invoice_id}", response_model=WhyNotFlaggedResponse)
def explain_why_not_flagged(
    invoice_id: str,
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> WhyNotFlaggedResponse:
    return container.explain_why_not_flagged(
        invoice_id,
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )
