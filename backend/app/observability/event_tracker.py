from __future__ import annotations

from datetime import datetime, timezone
from threading import Lock
from typing import Any, Dict, List, Optional


class EventTracker:
    def __init__(self) -> None:
        self._events: List[Dict[str, Any]] = []
        self._lock = Lock()

    def track(
        self,
        event_type: str,
        payload: Optional[Dict[str, Any]] = None,
        actor: str = "system",
    ) -> Dict[str, Any]:
        event = {
            "event_type": event_type,
            "actor": actor,
            "payload": payload or {},
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        with self._lock:
            self._events.append(event)
        return event

    def recent(self, limit: int = 100) -> List[Dict[str, Any]]:
        with self._lock:
            return self._events[-limit:]

    def count(self) -> int:
        with self._lock:
            return len(self._events)

