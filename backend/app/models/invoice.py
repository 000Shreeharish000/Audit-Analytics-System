from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Invoice(BaseModel):
    invoice_id: str = Field(..., description="Unique invoice identifier")
    vendor_id: str
    amount: float
    currency: str = "INR"
    submitted_by: Optional[str] = None
    created_at: datetime

