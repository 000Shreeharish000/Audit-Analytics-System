from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, Query

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import VendorSearchResponse, VendorSubgraphResponse
from app.security.rbac import require_roles

router = APIRouter(tags=["graph"])


@router.get("/graph")
def get_graph(
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> Dict[str, Any]:
    return container.get_graph_payload(
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )


@router.get("/graph/vendors/search", response_model=VendorSearchResponse)
def search_vendors(
    q: str = Query(default="", max_length=120),
    limit: int = Query(default=12, ge=1, le=50),
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> VendorSearchResponse:
    return container.search_vendors(
        q,
        limit=limit,
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )


@router.get("/graph/vendors/{vendor_id}/subgraph", response_model=VendorSubgraphResponse)
def get_vendor_subgraph(
    vendor_id: str,
    employee_id: Optional[str] = Query(default=None),
    rule_id: Optional[str] = Query(default=None),
    risk_level: Optional[str] = Query(default=None),
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> VendorSubgraphResponse:
    return container.get_vendor_subgraph(
        vendor_id,
        employee_id=employee_id,
        rule_id=rule_id,
        risk_level=risk_level,
        actor=current_user["username"],
        viewer_role=current_user["role"],
    )
