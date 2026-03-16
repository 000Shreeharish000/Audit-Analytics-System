from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import RuleResult
from app.security.rbac import require_roles

router = APIRouter(prefix="/rules", tags=["rules"])


@router.get("/run", response_model=list[RuleResult])
def run_rules(
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> list[RuleResult]:
    return container.run_rules(actor=current_user["username"])


@router.get("/simulate")
def simulate_rules(
    invoice_threshold: Optional[float] = None,
    high_value_threshold: Optional[float] = None,
    required_approvals: Optional[int] = None,
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> Dict[str, Any]:
    return container.simulate_rules(
        actor=current_user["username"],
        invoice_threshold=invoice_threshold,
        high_value_threshold=high_value_threshold,
        required_approvals=required_approvals,
    )
