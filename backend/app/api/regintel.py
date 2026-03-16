from __future__ import annotations

from typing import Any, Dict, List, Optional
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.dependencies import RuntimeContainer, get_container
from app.security.rbac import require_roles

router = APIRouter(prefix="/regintel", tags=["regintel"])


class RegulatorySignalOut(BaseModel):
    signal_id: str
    regulator: str
    circular: str
    topic: str
    status: str
    signal_date: str
    effective_date: str
    summary: str
    full_description: str
    requirements: List[str]
    gap: Optional[str]
    source_url: str
    created_by: str
    created_at: str


class CreateSignalRequest(BaseModel):
    regulator: str = Field(..., min_length=1)
    circular: str = Field(..., min_length=1)
    topic: str = Field(..., min_length=1)
    status: str = "Processed"
    signal_date: str
    effective_date: str
    summary: str = Field(..., min_length=1)
    full_description: str = ""
    requirements: List[str] = []
    gap: Optional[str] = None
    source_url: str = ""


@router.get("/signals", response_model=List[RegulatorySignalOut])
def list_signals(
    current_user: dict = Depends(require_roles("admin", "auditor", "risk_analyst")),
    container: RuntimeContainer = Depends(get_container),
) -> List[RegulatorySignalOut]:
    return container.list_regulatory_signals()


@router.post("/signals", response_model=RegulatorySignalOut)
def create_signal(
    payload: CreateSignalRequest,
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> RegulatorySignalOut:
    return container.create_regulatory_signal(payload, actor=current_user["username"])


@router.post("/signals/upload", response_model=Dict[str, Any])
async def upload_signal_document(
    regulator: str = Form(...),
    topic: str = Form(...),
    files: List[UploadFile] = File(...),
    current_user: dict = Depends(require_roles("admin")),
    container: RuntimeContainer = Depends(get_container),
) -> Dict[str, Any]:
    if not files:
        raise HTTPException(status_code=422, detail="At least one file is required")

    results = []
    for upload in files:
        content = await upload.read()
        result = container.ingest_regulatory_signal_document(
            regulator=regulator,
            topic=topic,
            filename=upload.filename or "uploaded_document",
            content=content,
            actor=current_user["username"],
        )
        results.append(result)
    return {"uploaded": len(results), "signals": results}

