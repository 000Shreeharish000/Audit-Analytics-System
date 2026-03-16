from __future__ import annotations

import json
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from app.dependencies import RuntimeContainer, get_container
from app.models.decision import DatasetPayload, IngestResponse
from app.security.rbac import require_roles

router = APIRouter(prefix="/dataset", tags=["dataset"])


@router.get("/load", response_model=IngestResponse)
def load_simulated_dataset(
    current_user: dict = Depends(require_roles("admin", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> IngestResponse:
    dataset_path = Path(__file__).resolve().parents[1] / "data" / "simulated_enterprise_dataset.json"
    if not dataset_path.exists():
        raise HTTPException(status_code=404, detail="Simulated dataset file not found")

    with dataset_path.open("r", encoding="utf-8") as file:
        payload = DatasetPayload.model_validate(json.load(file))

    return container.ingest_dataset(payload, actor=current_user["username"], source="local_dataset")

