from __future__ import annotations

from fastapi import APIRouter, Depends

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import DatasetPayload, IngestResponse
from app.security.rbac import require_roles

router = APIRouter(tags=["ingestion"])


@router.post("/ingest", response_model=IngestResponse)
def ingest_dataset(
    payload: DatasetPayload,
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> IngestResponse:
    return container.ingest_dataset(payload, actor=current_user["username"], source="api_upload")

