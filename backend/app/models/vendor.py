from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class Vendor(BaseModel):
    vendor_id: str = Field(..., description="Unique vendor identifier")
    name: str
    created_by: str
    created_at: datetime
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None

