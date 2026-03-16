# Decision & Financial Digital Twin Platform

Enterprise governance intelligence platform for detecting control-bypass pathways in financial systems through graph analytics, deterministic rule reasoning, and optional multi-model agent analysis.

## Repository Release Note

This codebase represents the **advanced hackathon/demo version** of the project, not just the initial prototype snapshot.

- If you are updating an older repository that contains the early-stage version, treat this build as the **current canonical version**.
- The newer version expands the platform across backend governance controls, investigation workflows, manual-audit evidence capture, report writing, telemetry, and a polished admin/auditor dashboard experience.
- For a concise summary of what changed compared with the earlier prototype stage, see [`CHANGELOG.md`](./CHANGELOG.md).

## Highlights

- Secure JWT authentication with RBAC (`admin`, `auditor`, `risk_analyst`)
- Account lockout protection and password policy enforcement
- Encrypted persistence in SQLite (WAL mode for durability)
- Tamper-evident audit chain (hash-linked + HMAC signed logs)
- Automatic and manual backup support
- NetworkX digital twin graph with pathway and collusion detection
- Rule engine + trust score engine + investigation generator
- Optional multi-model agent orchestration with data-redacted external calls
- Air-gapped deterministic fallback always available
- Company-isolated governance policy profiles with threshold controls
- Policy versioning workflow (`draft -> publish`) with explicit approval
- Policy document ingestion (company/government/compliance) with rule extraction
- Auditor favoritism alerts with admin-only sting visibility
- Conflict-aware auditor assignment and counterparty onboarding controls
- Case lifecycle management (`open`, `in_review`, `escalated`, `closed`, `false_positive`)
- Signed evidence bundle export for audit/legal handoff
- Backup restore drill endpoint (`preview` and `inplace`)
- Security quality gate automation (ruff, mypy, bandit, pip-audit)

## Quick Start

```bash
cd decision-digital-twin
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
cd backend
uvicorn app.main:app --reload --env-file ..\\.env
```

In a second terminal, run frontend:

```bash
cd decision-digital-twin/frontend
npm install
npm run dev
```

Open:
- backend docs: `http://127.0.0.1:8000/docs`
- frontend: `http://localhost:3000`

Detailed module documentation is available in folder-level README files under `backend/` and `backend/app/*`.

## Repository Structure

- `backend/` — FastAPI API, security controls, governance flows, persistence, tests, and runtime container logic
- `frontend/` — Next.js dashboard for admin/auditor workflows, investigation UX, report writer, telemetry, and policy/reference views
- `requirements.txt` — top-level Python bootstrap requirements

When publishing this project to GitHub, commit the source tree with `.gitignore` respected so local secrets, runtime data, build artifacts, virtual environments, and `node_modules` are not uploaded.

## Default Bootstrap Users

Configured through `BOOTSTRAP_USERS_JSON` in `.env.example`:

- `admin / Admin@12345`
- `auditor / Auditor@12345`
- `risk_analyst / Risk@12345`

## Core API Endpoints

- `POST /auth/login`
- `POST /auth/users` (admin)
- `GET /auth/users` (admin)
- `POST /ingest`
- `GET /dataset/load`
- `GET /graph`
- `GET /rules/run`
- `GET /rules/simulate`
- `GET /pathways`
- `GET /investigation/{case_id}`
- `GET /investigation/{case_id}?enhanced=true`
- `GET /investigation/{case_id}/agents`
- `GET /investigation/{case_id}/bundle`
- `GET /explain/{case_id}`
- `GET /explain/why-not-flagged/invoice/{invoice_id}`
- `GET /system/state`
- `GET /system/metrics`
- `GET /system/audit/verify`
- `POST /system/backup`
- `POST /system/backup/restore`
- `POST /governance/policies`
- `GET /governance/policies`
- `GET /governance/policies/{company_id}`
- `GET /governance/policies/{company_id}/versions`
- `GET /governance/policies/{company_id}/versions/{version}`
- `POST /governance/policies/{company_id}/publish`
- `POST /governance/policies/{company_id}/rules/upload`
- `GET /governance/policies/{company_id}/documents`
- `POST /governance/counterparties`
- `GET /governance/counterparties/{company_id}`
- `POST /governance/assignments`
- `GET /governance/assignments/{company_id}`
- `GET /governance/alerts/{company_id}` (admin only)
- `POST /governance/cases/{case_id}/status`
- `GET /governance/cases/{case_id}/status`

## Security and Safety Controls

- Password hashing (PBKDF2) + lockout after repeated login failures
- Signed JWT tokens with issuer/audience validation
- Request size limiting and API rate limiting
- Security headers, request correlation IDs, trusted hosts, CORS controls
- Encrypted database payloads and integrity checksums
- Tamper-evident audit logs with chain verification endpoint
- Backup snapshots for DB + audit log to reduce data-loss risk
- Sensitive field redaction in logs and external model egress payloads
- Admin-only alert visibility for suspicious auditors and linked cases
- Conflict-aware assignment to reduce relationship-based bias pathways
- Auditor role is read-only for published cases (cannot run rule recalculation)
- Signed evidence bundles with deterministic manifest hashing + HMAC signature
- Automated quality gate in CI (`ruff`, `mypy`, `bandit`, `pip-audit`)
- Documented vulnerability exceptions with explicit tracking in `backend/SECURITY_EXCEPTIONS.md`

## Multi-Model Agent Mode

- Auto-enabled when `ENABLE_EXTERNAL_AI=auto` and either `OPENAI_API_KEY` or `EXTERNAL_AI_API_KEY` is present
- When enabled, calls are sent only through policy-governed, redacted payloads
- Local deterministic reasoning remains the source of truth
- External models provide supplemental explanation and recommendation layers
- A single OpenAI key is enough for all external agent roles in the current implementation

## Demo Flow

1. Login and obtain bearer token.
2. Load dataset with `GET /dataset/load`.
3. Run rules with `GET /rules/run`.
4. Detect pathways with `GET /pathways`.
5. Generate investigation with `GET /investigation/{case_id}?enhanced=true`.
6. Run what-if checks with `GET /rules/simulate` by changing thresholds.
7. Show transparency using `GET /system/state`, `GET /system/metrics`, and `GET /system/audit/verify`.
8. Trigger `POST /system/backup` to demonstrate resilience controls.
9. Upload policy docs via `POST /governance/policies/{company_id}/rules/upload`.
10. Publish policy draft via `POST /governance/policies/{company_id}/publish`.
11. Assign auditors and show conflict-safe routing via `POST /governance/assignments`.
12. Export signed evidence via `GET /investigation/{case_id}/bundle`.
13. Run a restore drill via `POST /system/backup/restore` with `mode=preview`.
