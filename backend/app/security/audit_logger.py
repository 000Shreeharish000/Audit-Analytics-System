from __future__ import annotations

import hashlib
import hmac
import json
import os
from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional
from uuid import uuid4

import structlog


SENSITIVE_KEYS = {
    "password",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "authorization",
}


def configure_structlog() -> None:
    structlog.configure(
        processors=[
            structlog.processors.TimeStamper(fmt="iso", utc=True),
            structlog.processors.add_log_level,
            structlog.processors.JSONRenderer(),
        ],
        cache_logger_on_first_use=True,
    )


def _mask_sensitive(payload: Dict[str, Any]) -> Dict[str, Any]:
    masked: Dict[str, Any] = {}
    for key, value in payload.items():
        key_lower = key.lower()
        if key_lower in SENSITIVE_KEYS:
            masked[key] = "***redacted***"
            continue
        if isinstance(value, dict):
            masked[key] = _mask_sensitive(value)
        elif isinstance(value, list):
            masked[key] = [
                _mask_sensitive(item) if isinstance(item, dict) else item for item in value
            ]
        else:
            masked[key] = value
    return masked


class AuditLogger:
    def __init__(self, audit_log_path: str, signing_key: str) -> None:
        configure_structlog()
        self._logger = structlog.get_logger("decision_digital_twin.audit")
        self._audit_log_path = audit_log_path
        self._signing_key = signing_key.encode("utf-8")
        self._events: List[Dict[str, Any]] = []
        self._lock = Lock()
        directory = os.path.dirname(audit_log_path)
        if directory:
            os.makedirs(directory, exist_ok=True)
        self._sequence = 0
        self._last_hash = "GENESIS"
        self._resume_chain_state()

    def _resume_chain_state(self) -> None:
        if not os.path.exists(self._audit_log_path):
            return
        last_line = ""
        with open(self._audit_log_path, "r", encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    last_line = line.strip()
        if not last_line:
            return
        try:
            event = json.loads(last_line)
            self._sequence = int(event.get("sequence", 0))
            self._last_hash = str(event.get("event_hash", "GENESIS"))
        except (json.JSONDecodeError, ValueError):
            self._sequence = 0
            self._last_hash = "GENESIS"

    def _event_hash(self, payload: Dict[str, Any], previous_hash: str) -> str:
        body = json.dumps(payload, sort_keys=True, separators=(",", ":"))
        digest = hashlib.sha256((previous_hash + body).encode("utf-8")).hexdigest()
        return digest

    def _signature(self, event_hash: str) -> str:
        return hmac.new(self._signing_key, event_hash.encode("utf-8"), hashlib.sha256).hexdigest()

    def log(
        self,
        event_type: str,
        actor: str = "system",
        details: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        details = _mask_sensitive(details or {})
        timestamp = datetime.now(timezone.utc).isoformat()

        with self._lock:
            sequence = self._sequence + 1
            previous_hash = self._last_hash
            core = {
                "event_id": str(uuid4()),
                "sequence": sequence,
                "event_type": event_type,
                "actor": actor,
                "details": details,
                "timestamp": timestamp,
                "previous_hash": previous_hash,
            }
            event_hash = self._event_hash(core, previous_hash)
            event_signature = self._signature(event_hash)
            event = {
                **core,
                "event_hash": event_hash,
                "signature": event_signature,
            }
            self._events.append(event)

            with open(self._audit_log_path, "a", encoding="utf-8") as handle:
                handle.write(json.dumps(event, sort_keys=True) + "\n")

            self._sequence = sequence
            self._last_hash = event_hash

        self._logger.info("audit_event", **event)
        return event

    def verify_chain(self) -> Dict[str, Any]:
        if not os.path.exists(self._audit_log_path):
            return {"valid": True, "checked_events": 0}

        previous_hash = "GENESIS"
        checked = 0
        with open(self._audit_log_path, "r", encoding="utf-8") as handle:
            for line_no, raw_line in enumerate(handle, start=1):
                line = raw_line.strip()
                if not line:
                    continue
                try:
                    event = json.loads(line)
                except json.JSONDecodeError:
                    return {"valid": False, "line": line_no, "reason": "invalid_json"}

                provided_hash = event.get("event_hash")
                provided_signature = event.get("signature")
                core = dict(event)
                core.pop("event_hash", None)
                core.pop("signature", None)

                if core.get("previous_hash") != previous_hash:
                    return {"valid": False, "line": line_no, "reason": "broken_chain"}

                expected_hash = self._event_hash(core, previous_hash)
                if not hmac.compare_digest(str(provided_hash), expected_hash):
                    return {"valid": False, "line": line_no, "reason": "hash_mismatch"}

                expected_signature = self._signature(expected_hash)
                if not hmac.compare_digest(str(provided_signature), expected_signature):
                    return {"valid": False, "line": line_no, "reason": "signature_mismatch"}

                previous_hash = expected_hash
                checked += 1

        return {"valid": True, "checked_events": checked}

    def recent_events(self, limit: int = 200) -> List[Dict[str, Any]]:
        return self._events[-limit:]

