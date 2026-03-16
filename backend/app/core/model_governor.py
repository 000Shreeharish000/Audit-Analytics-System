from __future__ import annotations

import re
from typing import Any, Dict, List

from app.config import Settings


class ModelGovernor:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def external_enabled(self) -> bool:
        return bool(self.settings.enable_external_ai and self.settings.external_ai_api_key)

    def model_allowed(self, model_name: str) -> bool:
        return model_name in self.settings.external_ai_models

    def approved_models(self) -> List[str]:
        return list(self.settings.external_ai_models)

    def sanitize_for_external(self, payload: Dict[str, Any]) -> Dict[str, Any]:
        text = str(payload)
        text = re.sub(r"\b(E|V|I|P|A)\d+\b", "<ENTITY_ID>", text)
        text = re.sub(r"\bCASE-\d+\b", "<CASE_ID>", text)
        text = re.sub(r"\b\d{6,}\b", "<HIGH_VALUE_NUMBER>", text)
        return {
            "sanitized_context": text[:5000],
            "policy": "ids_and_high_value_numbers_redacted",
        }

