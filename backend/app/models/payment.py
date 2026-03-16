from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class Payment(BaseModel):
    payment_id: str = Field(..., description="Unique payment identifier")
    invoice_id: str
    vendor_id: str
    amount: float
    executed_by: str
    executed_at: datetime

