from __future__ import annotations

from datetime import datetime, timezone
from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.dependencies import RuntimeContainer, get_container
from app.security.rbac import require_roles

router = APIRouter(prefix="/audit/manual", tags=["manual_audit"])


class ManualAuditRequest(BaseModel):
    vendor_id: str
    case_ids: List[str] = Field(default_factory=list)
    severity: str = "MEDIUM"  # LOW | MEDIUM | HIGH | CRITICAL
    notes: str = ""
    findings: List[str] = Field(default_factory=list)
    recommended_action: str = ""


class ManualAuditRecord(BaseModel):
    audit_id: str
    auditor_id: str
    vendor_id: str
    case_ids: List[str]
    severity: str
    notes: str
    findings: List[str]
    recommended_action: str
    created_at: str
    status: str  # "open" | "closed" | "escalated"


@router.post("", response_model=ManualAuditRecord)
def create_manual_audit(
    payload: ManualAuditRequest,
    current_user: dict = Depends(require_roles("admin", "auditor")),
    container: RuntimeContainer = Depends(get_container),
) -> ManualAuditRecord:
    """Create a manual audit record initiated by an auditor or admin."""
    audit_id = f"MAUDIT-{str(uuid4())[:8].upper()}"
    record = ManualAuditRecord(
        audit_id=audit_id,
        auditor_id=current_user["username"],
        vendor_id=payload.vendor_id,
        case_ids=payload.case_ids,
        severity=payload.severity,
        notes=payload.notes,
        findings=payload.findings,
        recommended_action=payload.recommended_action,
        created_at=datetime.now(timezone.utc).isoformat(),
        status="open",
    )
    container.store.upsert_manual_audit(record.model_dump())
    container.audit_logger.log(
        "manual_audit_created",
        actor=current_user["username"],
        details={
            "audit_id": audit_id,
            "vendor_id": payload.vendor_id,
            "severity": payload.severity,
        },
    )
    return record


@router.get("/list", response_model=List[ManualAuditRecord])
def list_manual_audits(
    current_user: dict = Depends(require_roles("admin", "auditor")),
    container: RuntimeContainer = Depends(get_container),
) -> List[ManualAuditRecord]:
    """List all manual audits visible to the current user."""
    auditor_filter = current_user["username"] if current_user["role"] == "auditor" else None
    raw = container.store.list_manual_audits(auditor_id=auditor_filter)
    return [ManualAuditRecord(**r) for r in raw]


@router.get("/{vendor_id}", response_model=List[ManualAuditRecord])
def get_audits_by_vendor(
    vendor_id: str,
    current_user: dict = Depends(require_roles("admin", "auditor")),
    container: RuntimeContainer = Depends(get_container),
) -> List[ManualAuditRecord]:
    """Get all manual audit records for a specific vendor."""
    raw = container.store.list_manual_audits(vendor_id=vendor_id)
    return [ManualAuditRecord(**r) for r in raw]
