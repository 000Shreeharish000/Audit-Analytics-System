from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class Employee(BaseModel):
    employee_id: str = Field(..., description="Unique employee identifier")
    name: str
    department: str
    role: str
    manager_id: Optional[str] = None

