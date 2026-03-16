# API Layer

HTTP interface for platform capabilities.

## Key Routers
- `auth.py`: Login and user provisioning APIs.
- `ingest.py` / `dataset.py`: Dataset ingestion endpoints.
- `rules.py`: Rule execution and what-if simulation.
- `pathways.py`: Control-bypass pathway publication.
- `investigation.py`: Investigation generation, agent panel, evidence bundle export.
- `explain.py`: Human-readable explainability APIs, including why-not-flagged.
- `system_state.py`: State/metrics/audit/backup endpoints.
- `governance.py`: Policy version workflow, rule document upload, assignments, alerts, case lifecycle.

## Design Notes
- Routes are intentionally thin.
- Security enforcement happens through RBAC dependencies.
- Business logic is centralized in `app.dependencies.RuntimeContainer`.
