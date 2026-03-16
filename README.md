# Audit Analytics System

Single consolidated repository guide for GitHub.

## Repository Overview

The platform includes:
- A FastAPI backend for governance, rules, pathway detection, explainability, and investigations.
- A Next.js frontend for control room views, digital twin exploration, and investigation workflows.
- Security, observability, graph, and policy-driven decision modules.
- Local and CI quality gates for linting, typing, code security, and dependency audit.

## Top-Level Structure

- `backend/`: Runnable backend service, scripts, and tests.
- `frontend/`: Next.js web application integrated with backend APIs.
- `.github/workflows/`: CI workflow definitions.
- `sample-policy-pdfs/`: Demo policy/legal document assets.
- `tools/`: Project utility tooling.

## Backend Workspace

The backend folder contains the runnable service and test suite.

### Backend Structure

- `backend/app/`: FastAPI application package.
- `backend/tests/`: Unit and integration tests for rules, pathways, governance, and security controls.
- `backend/requirements-dev.txt`: Development tools (linting, typing, security scans).
- `backend/pyproject.toml`: Ruff and mypy configuration.
- `backend/scripts/`: Operational scripts (quality and security gate).

### Run Backend

1. `pip install -r requirements.txt`
2. `cd backend`
3. `uvicorn app.main:app --reload --env-file ..\.env`

### Validate Backend

- `python -m pytest -q`
- `python -m compileall app`
- `powershell -File scripts\security_quality_gate.ps1`

Known dependency-audit exceptions are tracked in `backend/SECURITY_EXCEPTIONS.md`.

## Frontend Workspace

The frontend is connected to the FastAPI backend and includes:
- Cinematic landing with zoom narrative and 3D hero object.
- System transparency modules with animated architecture flow.
- Digital twin graph preview and control-bypass storyline.
- Control-room dashboard with real backend data and investigation panel.

### Backend Integrations Used by Frontend

- Auth login.
- Dataset load.
- Rule run.
- Pathway detection.
- Graph fetch.
- System-state and metrics fetch.
- Investigation panel generation.

### Frontend Environment

Create `frontend/.env.local` from `frontend/.env.example`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000
NEXT_PUBLIC_DEMO_USERNAME=admin
NEXT_PUBLIC_DEMO_PASSWORD=Admin@12345
```

### Run Frontend

1. `cd frontend`
2. `npm install`
3. `npm run dev`
4. Open `http://localhost:3000`

Notes:
- Use `Explore Platform` to enter the dashboard.
- Dashboard auto-initializes against backend APIs.
- Theme toggle enables animated light/dark transitions.
- Demo credentials must match backend bootstrap users.
- Backend CORS must allow frontend origin (default includes `http://localhost:3000`).

## App Package Details

The `backend/app/` package is organized as:
- `api/`: Route declarations and request and response wiring.
- `core/`: Business engines (rules, pathways, compliance, persistence, orchestration).
- `graph/`: Graph builder, query conversion, and export helpers.
- `models/`: Pydantic domain contracts.
- `security/`: Auth, RBAC, encryption, middleware, and tamper-evident audit logging.
- `observability/`: Metrics, event tracking, and system-state snapshots.
- `data/`: Demo dataset, runtime DB, audit logs, and backup snapshots.

Runtime entry points:
- `backend/app/main.py`: FastAPI app factory and middleware/router mounting.
- `backend/app/dependencies.py`: Runtime container and service orchestration.

## API Layer

HTTP interface for platform capabilities.

Key routers:
- `auth.py`: Login and user provisioning APIs.
- `ingest.py` and `dataset.py`: Dataset ingestion endpoints.
- `rules.py`: Rule execution and what-if simulation.
- `pathways.py`: Control-bypass pathway publication.
- `investigation.py`: Investigation generation, agent panel, evidence bundle export.
- `explain.py`: Human-readable explainability APIs, including why-not-flagged.
- `system_state.py`: State, metrics, audit, and backup endpoints.
- `governance.py`: Policy version workflow, uploads, assignments, alerts, and case lifecycle.

Design notes:
- Routes are intentionally thin.
- Security enforcement happens through RBAC dependencies.
- Business logic is centralized in `app.dependencies.RuntimeContainer`.

## Core Engines

Major components:
- `decision_engine.py`: Converts transactions and approvals into decision nodes.
- `rule_engine.py`: Deterministic governance rule checks.
- `pathway_detector.py`: Case generation from graph pathways and trust scores.
- `auditor_guard.py`: Favoritism detection and conflict-aware auditor assignment.
- `compliance_engine.py`: Rule extraction from uploaded policy/government/compliance files.
- `explanation_engine.py`: Investigation narrative generation.
- `agent_orchestrator.py`: Multi-agent analysis overlay (local first, optional external).
- `persistence.py`: Encrypted SQLite storage and integrity checks.
- `backup_manager.py`: Snapshot creation and restore drill support.
- `secure_ai_inference.py`: Air-gapped deterministic scoring and explanation utilities.

Principles:
- Deterministic first.
- Traceability on every mutation.
- Policy-driven behavior where company rules are authoritative.

## Graph Layer

Graph files:
- `graph_builder.py`: Builds and updates a `networkx.MultiDiGraph` from enterprise data.
- `graph_queries.py`: Converts graph data into frontend-friendly payloads.
- `graph_export.py`: Exports graph in Neo4j-compatible structure.

Node families:
- Employee, Vendor, Invoice, Approval, Payment, Decision, Rule, Case.

Edge families:
- CREATED_VENDOR, APPROVED_VENDOR, ISSUED_INVOICE, APPROVED_INVOICE.
- EXECUTED_PAYMENT, DECISION_LINK, TRIGGERED_RULE, PART_OF_CASE, relationship edges.

## Domain Models

Pydantic schemas are used across API, core services, persistence boundaries, and tests.

Coverage:
- Transaction entities: employee, vendor, invoice, approval, payment.
- Analytical entities: decision, rule result, case result, investigation report.
- Governance entities: company policies, policy versions, onboarding, alerts, assignments.
- Operations entities: backup/restore responses, case updates, explainability responses.

Contract discipline:
- Models define canonical field names and validation constraints.
- API routes and persistence adapters should use these models consistently.

## Security Layer

Security controls include authentication, authorization, data protection, and API protection.

Files:
- `auth_handler.py`: Password policy, hashing, JWT issue and verify.
- `rbac.py`: Role-based access guards.
- `audit_logger.py`: Structured, hash-linked, HMAC-signed audit trail.
- `encryption.py`: Application-level payload encryption at rest.
- `api_guard.py`: Middleware for request IDs, rate limiting, size limits, and security headers.

Roles:
- `admin`: Full governance control and sensitive visibility.
- `risk_analyst`: Operational analysis and workflow management.
- `auditor`: Restricted review-only access for published case outputs.

## Observability Layer

Operational transparency and measurement for demo and production hardening.

Files:
- `metrics.py`: In-memory counters and gauges.
- `event_tracker.py`: Runtime event stream for recent activity views.
- `system_monitor.py`: Aggregated system-state snapshot including risk posture and storage counts.

Notes:
- Metrics and events are separate from immutable audit logs.
- Frontend transparency APIs should read from this layer for live visuals.

## Data Assets

The `backend/app/data/` folder stores runtime and demo data.

Contents:
- `simulated_enterprise_dataset.json`: Demo dataset with built-in control-bypass and social-link scenarios.
- `platform_state.db`: Encrypted SQLite state store created at runtime.
- `audit_trail.jsonl`: Tamper-evident structured audit chain created at runtime.
- `backups/`: Snapshot folders from manual and automatic backup events.

Operational guidance:
- Treat runtime files as sensitive.
- For demos, clear runtime artifacts and reload through `/dataset/load`.

## Tests

Automated verification for governance logic, security controls, and detection flows.

Files:
- `test_rule_and_pathway_flow.py`: Core rule and pathway behavior checks.
- `test_security_controls.py`: Encryption, password policy, audit-chain integrity checks.
- `test_governance_controls.py`: Policy versioning, lifecycle workflow, visibility controls, restore drill, explainability.

Run tests:
- `python -m pytest -q`

## Scripts and Quality Gate

`backend/scripts/security_quality_gate.ps1` runs:
1. Ruff static lint.
2. Mypy type validation.
3. Bandit medium+ severity security scan.
4. Pip-audit dependency audit with tracked exceptions.

Run:

```powershell
powershell -File backend/scripts/security_quality_gate.ps1
```

## CI Workflows

`security-quality.yml` runs backend quality and security checks on push and pull requests:
1. Install runtime and dev dependencies.
2. Run Ruff lint.
3. Run mypy checks.
4. Run Bandit security scan.
5. Run pip-audit with tracked exceptions.

This mirrors the local backend quality gate for local and CI parity.
