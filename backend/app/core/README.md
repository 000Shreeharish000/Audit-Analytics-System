# Core Engines

Business and infrastructure logic.

## Major Components
- `decision_engine.py`: Converts transactions and approvals into decision nodes.
- `rule_engine.py`: Deterministic governance rule checks.
- `pathway_detector.py`: Case generation from graph pathways + trust scores.
- `auditor_guard.py`: Favoritism detection and conflict-aware auditor assignment.
- `compliance_engine.py`: Rule extraction from uploaded policy/government/compliance files.
- `explanation_engine.py`: Investigation narrative generation.
- `agent_orchestrator.py`: Multi-agent analysis overlay (local first, optional external).
- `persistence.py`: Encrypted SQLite storage and integrity checks.
- `backup_manager.py`: Snapshot creation and restore drill support.
- `secure_ai_inference.py`: Air-gapped deterministic scoring/explanation utilities.

## Principles
- Deterministic first.
- Traceability on every mutation.
- Policy-driven behavior where company rules are authoritative.
