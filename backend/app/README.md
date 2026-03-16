# App Package

Enterprise governance backend package.

## Submodules
- `api/`: Route declarations and request/response wiring.
- `core/`: Business engines (rules, pathways, compliance, persistence, orchestration).
- `graph/`: Graph builder, query payload conversion, and export helpers.
- `models/`: Pydantic domain contracts.
- `security/`: Auth, RBAC, encryption, middleware, tamper-evident audit logging.
- `observability/`: Metrics, event tracking, and system state snapshots.
- `data/`: Demo dataset, runtime DB, audit logs, backup snapshots.

## Runtime Entry
- `main.py`: FastAPI app factory and middleware/router mounting.
- `dependencies.py`: Runtime container and service orchestration.
