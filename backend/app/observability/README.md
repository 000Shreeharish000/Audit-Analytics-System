# Observability Layer

Operational transparency and measurement for demo and production hardening.

## Files
- `metrics.py`: In-memory counters and gauges.
- `event_tracker.py`: Runtime event stream for recent activity views.
- `system_monitor.py`: Aggregated system state snapshot, including risk posture and storage counts.

## Notes
- Metrics and events are separate from immutable audit logs.
- Frontend transparency APIs should read from this layer for live system-state visuals.
