from __future__ import annotations

from threading import Lock
from typing import Dict


class MetricsRegistry:
    def __init__(self) -> None:
        self._baseline_counters: Dict[str, float] = {
            "events_processed": 0,
            "nodes_created": 0,
            "decisions_created": 0,
            "rules_triggered": 0,
            "cases_detected": 0,
            "investigations_generated": 0,
            "auth_failures": 0,
            "backup_runs": 0,
            "agent_analyses": 0,
        }
        self._baseline_gauges: Dict[str, float] = {
            "graph_density": 0,
            "risk_level_score": 0,
        }
        self._counters: Dict[str, float] = dict(self._baseline_counters)
        self._gauges: Dict[str, float] = dict(self._baseline_gauges)
        self._lock = Lock()

    def increment(self, metric: str, value: float = 1) -> None:
        with self._lock:
            self._counters[metric] = self._counters.get(metric, 0) + value

    def set_gauge(self, metric: str, value: float) -> None:
        with self._lock:
            self._gauges[metric] = value

    def snapshot(self) -> Dict[str, Dict[str, float]]:
        with self._lock:
            return {
                "counters": dict(self._counters),
                "gauges": dict(self._gauges),
            }

    def reset(self) -> None:
        with self._lock:
            self._counters = dict(self._baseline_counters)
            self._gauges = dict(self._baseline_gauges)

    def set_counter(self, metric: str, value: float) -> None:
        with self._lock:
            self._counters[metric] = value
