from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class Approval(BaseModel):
    approval_id: str = Field(..., description="Unique approval identifier")
    target_type: Literal["vendor", "invoice", "payment"]
    target_id: str
    employee_id: str
    approved_at: datetime

