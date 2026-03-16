# Decision & Financial Digital Twin Platform

> **Enterprise-grade AI-powered fraud detection and compliance governance system** — built on graph intelligence, multi-agent orchestration, and cryptographic audit trails.

---

## 📌 Image Reference Guide

| Image | Where to Place | Why |
|-------|---------------|-----|
| `Delliote_mindmap_2.png` — *Audit Analytics Architecture with GenW.AI* | **After the Architecture Overview section** | Best technical diagram — shows full 3-layer stack (AppMaker → GenW Agent Builder → Visualization) cleanly |
| `Delliote_mindmap_1.png` — *POC Development Approach* | **After the Multi-Agent System section** | Shows agent coordination and data flow between all agents including Coordinating Agent and Realm AI |
| `Agent_Builder.png` — *Intelligence Layer — GenW Agent Builder* | **After the Agent Pipeline section** | Detailed internals of the 5-agent sequence with orchestration logic |
| `App_Maker.png` — *Data Ingestion Layer — AppMaker* | **After the Data Ingestion section** | Shows ERP → SQL → Data Connectors → Rule-Based Agents flow |

> **Recommendation**: Use `Delliote_mindmap_2.png` as the **hero/primary architecture diagram** right below the intro — it's the clearest, most technical, and most appropriate for a README.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [Core Modules](#core-modules)
  - [Data Ingestion & Validation](#data-ingestion--validation)
  - [Graph Intelligence Engine](#graph-intelligence-engine)
  - [Governance Rule Engine](#governance-rule-engine)
  - [Risk Scoring & Trust Engine](#risk-scoring--trust-engine)
  - [Multi-Agent AI Orchestration](#multi-agent-ai-orchestration)
  - [Case Management & Investigation](#case-management--investigation)
  - [Auditor Integrity & Conflict Detection](#auditor-integrity--conflict-detection)
  - [Policy & Compliance Governance](#policy--compliance-governance)
  - [Security Infrastructure](#security-infrastructure)
  - [Persistence & Disaster Recovery](#persistence--disaster-recovery)
- [Frontend Modules](#frontend-modules)
- [API Reference](#api-reference)
- [Authentication & RBAC](#authentication--rbac)
- [Deployment](#deployment)
- [Environment Variables](#environment-variables)
- [Feature Summary](#feature-summary)

---

## Overview

The **Decision & Financial Digital Twin Platform** is a production-grade system for detecting financial fraud, governance violations, and compliance breaches in enterprise environments. It ingests ERP data (vendors, invoices, approvals, payments), constructs a live graph-based digital twin of financial relationships, and applies deterministic AI reasoning to surface fraud patterns, generate audit cases, and support investigator workflows.

**Key capabilities:**
- Real-time graph construction from enterprise ERP data (employees, vendors, invoices, approvals, payments)
- 6 built-in fraud detection rules with mathematical confidence scoring
- 4-agent AI analysis panel with air-gapped and hybrid modes
- Blockchain-style append-only audit chain with HMAC signatures
- Role-based dashboards for admin, auditor, and risk analyst personas
- 3D interactive graph explorer with risk-highlighted nodes
- Zero-randomness deterministic AI engine — no external calls required

---

## Architecture

![Audit Analytics Architecture with GenW.AI](frontend/public/Delliote%20mindmap%202.png)

*Audit Analytics Architecture with GenW.AI - Three-layer system: AppMaker Data Ingestion -> GenW Agent Builder -> Visualization Layer.*

The platform is structured across three layers:

```
┌─────────────────────────────────────────────────────────────┐
│  LAYER 1: AppMaker Data Ingestion                           │
│  ERP Databases / Logs & Records / REST APIs                 │
│  → Data Validation · SQL Queries · JS Bindings             │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  LAYER 2: GenW Agent Builder                                │
│  Start Node                                                 │
│  → Data Validation Agent                                    │
│  → Relationship Graph Agent                                 │
│  → Compliance & Anomaly Agents                              │
│  → Orchestration Layer                                      │
│  → Risk Scoring & Condition Nodes                           │
│  → Decision Pathway Analysis Agent                          │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  LAYER 3: Visualization Layer                               │
│  GenW Playground Dashboards · Realm AI LLM Assistant        │
│  → Audit Report Generation                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend API | Python · FastAPI |
| Graph Engine | NetworkX MultiDiGraph |
| Database | SQLite with WAL mode (14-table schema) |
| Encryption | Fernet (AES-128 CBC + HMAC) · PBKDF2-HMAC-SHA256 |
| Audit Chain | SHA256 chained hashing · HMAC-SHA256 signatures |
| Frontend | Next.js · React · Zustand |
| 3D Visualization | Three.js |
| Animation | Framer Motion |
| PDF Export | jsPDF + html2canvas |
| Auth | JWT (HS256) with JTI, 60-min expiry |
| External AI (optional) | OpenAI-compatible API (air-gapped by default) |

---

## Core Modules

### Data Ingestion & Validation

![AppMaker Data Ingestion Layer](frontend/public/App%20Maker.png)

*AppMaker Data Ingestion Layer - SQL queries fetch ERP data through Data Connectors into Rule-Based Agents.*

Enterprise ERP data is ingested as a JSON payload containing employees, vendors, invoices, approvals, payments, and social relationships.

**AnomalyGuard Validation** runs an 8-step pipeline on every ingestion:

1. Company ID check
2. Size limits (50,000 records per entity type)
3. Duplicate ID detection (Counter-based)
4. Referential integrity: vendors → employees
5. Referential integrity: invoices → vendors
6. Referential integrity: approvals → targets
7. Referential integrity: payments → invoices/vendors/employees
8. Relationship nodes → known nodes

Data sources are tracked (`api_upload` vs `local_dataset`). A pre-loaded simulated enterprise dataset is available for instant demos.

---

### Graph Intelligence Engine

A **NetworkX MultiDiGraph** is constructed from the validated dataset.

**Node types:** Employee · Vendor · Invoice · Approval · Payment · Decision

**Edge types:**

| Edge | Meaning |
|------|---------|
| `CREATED_VENDOR` | Employee created vendor record |
| `APPROVED_VENDOR` | Employee approved vendor |
| `ISSUED_INVOICE` | Vendor issued invoice |
| `EXECUTED_PAYMENT` | Payment executed against invoice |
| `DECISION_LINK` | Connects decision audit trail nodes |
| `TRIGGERED_RULE` | Rule triggered on entity |
| `PART_OF_CASE` | Entity belongs to investigation case |

Social relationship edges (`KNOWS`, `REFERRED_BY`, `FAMILY`, `EX_COLLEAGUE`, `SOCIAL`) are mapped bidirectionally with confidence scores to enable collusion path detection.

**Control Bypass Detection** (via `GraphReasoner`):
- **Single-actor bypass** — set intersection finds same person across all control steps
- **Collusive chain** — Counter frequency finds 2–3 actors sharing multiple roles

Graph density is computed as `2 × edges / (nodes × (nodes − 1))` and used as a system health indicator.

---

### Governance Rule Engine

Six deterministic fraud detection rules are built in:

| Rule ID | Detection Pattern | Confidence | Severity |
|---------|------------------|-----------|---------|
| `RULE_VENDOR_SELF_APPROVAL` | `approved_by == created_by` | 0.90 | 0.95 |
| `RULE_JUST_BELOW_THRESHOLD` | ≥2 approvals in 90–100% of threshold | 0.82 | — |
| `RULE_HIGH_VALUE_LOW_APPROVAL` | Invoice ≥ threshold with fewer approvals than required | 0.86 | — |
| `RULE_RAPID_APPROVAL_CHAIN` | Invoice→payment ≤ 8 hours, ≥2 rapid events | 0.77 | — |
| `RULE_INVOICE_SPLITTING` | Small invoices from same vendor within 2 days totaling ≥150% of threshold | 0.84 | — |
| `RULE_ROLE_COLLISION` | ≤2 unique actors control creation + approval + payment | 0.83 | — |

Additional rules are extracted automatically from uploaded company/government policy documents.

**What-If Simulation:** The `/rules/simulate` endpoint lets you change thresholds hypothetically and observe impact on rule results without committing changes.

---

### Risk Scoring & Trust Engine

**Rule-level risk score formula:**

```
score = base_risk
      + (confidence × 20)
      + (severity × 20)
      + amount_factor      # capped at 15pts ($2M)
      + repetition_factor  # capped at 20pts (5 actors)
```

**Case-level trust score** (max 100) weighted across 5 components:

| Component | Weight |
|-----------|--------|
| Confidence | 30 |
| Path length | 20 |
| Actor repetition | 20 |
| Transaction amount | 15 |
| Severity | 15 |

**Risk bands:**

| Band | Score Range |
|------|------------|
| LOW | < 40 |
| MEDIUM | 40 – 64 |
| HIGH | 65 – 84 |
| CRITICAL | ≥ 85 |

The `SecureAIInferenceEngine` is entirely deterministic — zero external calls, zero randomness, pure mathematical computation with template-based explanations.

---

### Multi-Agent AI Orchestration

![GenW Agent Builder Intelligence Layer](frontend/public/Agent%20Builder.png)

*GenW Agent Builder Intelligence Layer - 5-agent pipeline with central orchestration and decision pathway analysis.*

The `MultiAgentOrchestrator` runs four specialized agents in parallel per case:

| Agent | Responsibility |
|-------|---------------|
| `graph_analyst` | Graph topology and relationship analysis |
| `policy_critic` | Policy compliance evaluation |
| `counterfactual_agent` | Alternative non-malicious interpretations |
| `remediation_agent` | Recommended corrective actions |

**Consensus Engine** averages confidence across all agents, deduplicates recommendations, and computes a `conflict_score` (spread between max/min confidence × 100). Returns top 6 recommendations.

**Operating modes:**

- **Air-Gapped Mode** (default): Entirely local, zero internet dependency, no data leaves the system
- **Hybrid Mode**: Local deterministic analysis + optional call to OpenAI-compatible external API

When external AI is enabled, `ModelGovernor` sanitizes outbound payloads by redacting entity IDs (E/V/I/P/A patterns), CASE-IDs, and 6+ digit numbers. Payload capped at 5,000 characters.

---

### Case Management & Investigation

![POC Development Approach](frontend/public/Delliote%20mindmap%201.png)

*POC Development Approach - Agent pipeline with Coordinating Agent, GenW Playground, and Realm AI investigation assistant.*

Cases are automatically generated by `PathwayDetector`, which matches detected bypass paths with triggered rules, computes trust scores, and assigns sequential IDs (`CASE-001`, `CASE-002`, ...). Cases are sorted by risk score (highest first).

Each investigation report contains:
- Executive summary
- Sequence of events (narrative)
- Rule evidence with confidence values
- Risk explanation
- Counterfactual analysis ("What if this wasn't fraud?")
- Recommended remediation actions
- Event timeline
- Full traceability dictionary

**Case lifecycle:** `open` → `investigating` → `escalated` → `closed`

Cases involving flagged auditors are automatically marked `admin_only` — the implicated auditor cannot see their own conflict alerts.

Evidence bundles can be exported as a streaming ZIP download via the API.

---

### Auditor Integrity & Conflict Detection

`AuditorGuard` builds a NetworkX graph of auditor relationships and detects:
- Auditors with ≥2 approvals on the same vendor
- Auditors with cumulative approval value ≥ $300K
- Social proximity via shortest-path hop distance

**Favoritism severity formula:**
```
severity = 0.45 + (count × 0.1) + ((max_hops − hops + 1) × 0.08)
```

**Least-conflicted auditor assignment** scores all available auditors:
```
conflict_score = max(0.1, 1/(hops+1)) + workload × 0.05
```
The auditor with the lowest total score is assigned to the case.

---

### Policy & Compliance Governance

Policy documents (PDF, DOCX, CSV, TXT, JSON, MD) can be uploaded and processed through automated rule extraction. The system scans document text for compliance keywords (`must`, `shall`, `required`, `prohibited`, `compliance`) and creates up to 25 rules per document with automatic severity scoring.

Policy versioning follows a **Draft → Published** workflow with full version history, approval tracking, and compliance tags.

Configurable policy thresholds per company:
- `invoice_approval_threshold`
- `high_value_payment_threshold`
- `required_approvals`
- `max_connection_hops`

---

### Security Infrastructure

| Control | Implementation |
|---------|---------------|
| Encryption at rest | Fernet (AES-128 CBC + HMAC), key derived via SHA256 |
| Integrity verification | SHA256 hash stored per record, recomputed on retrieval |
| Audit chain | Append-only JSONL; each event hash = `SHA256(prev_hash + event_body)` |
| Password hashing | PBKDF2-HMAC-SHA256, 390K iterations, 16-byte random salt, constant-time compare |
| Rate limiting | 120 requests/minute per IP+route, sliding window |
| Request size limit | 5MB max via Content-Length check |
| Security headers | X-Content-Type-Options, X-Frame-Options: DENY, Referrer-Policy, Permissions-Policy, Cache-Control: no-store |
| Sensitive data masking | Auto-redacts `password`, `token`, `secret`, `api_key`, `authorization` fields before audit logging |
| Request tracing | UUID-based `X-Request-ID` injected per request |
| Host validation | TrustedHostMiddleware blocks spoofed Host headers |

---

### Persistence & Disaster Recovery

- **SQLite with WAL mode** — 14-table schema, thread-safe with `Lock`, `PRAGMA synchronous=FULL`, foreign keys enforced
- **Timestamped backups** — copies DB + audit log, retains last N (default 20) backups with auto-deletion of oldest
- **Backup restore** — two modes: `preview` (temp copy) and `inplace` (overwrites originals), admin-only
- **State recovery on startup** — `_load_latest_state()` restores dataset, decisions, rules, cases, and investigations from encrypted SQLite on boot

---

## Frontend Modules

### Admin Dashboard

- **3D Graph Explorer** — Three.js canvas with type-based lane layout (switches to degree-based ring at >62% node homogeneity); risk nodes glow with additive blending; active case paths highlighted with dashed lines; hover tooltips
- **Event Stream** — Live color-coded feed (ingest=cyan, rule=blue, pathway=red, security=amber); click to expand full JSON; max 40 events
- **Investigation Panel** — Case selector with confidence ring, risk bullets, manual audit records, rules/actors pills, event timeline
- **Policy Compliance Updater** — Company workspace loader, threshold config, PDF/DOCX upload, version history
- **Telemetry Dashboard** — 4 KPI sparkline cards (30-sample rolling, 5s sampling), agent load gauges, 6-agent activity table, 20s auto-refresh
- **AI Search Bar** — Keyword routing ("investigate" → investigation tab, "graph" → graph tab); chat history popup

### Auditor Dashboard

- **Pipeline Console** — SVG flow diagram of 12 backend stages; click any stage for subprocess drill-down with audit traces and evidence references
- **Auditor Report Writer** — ContentEditable rich text editor with 16-button toolbar; auto-saves every 3s to localStorage + server; PDF export via jsPDF + html2canvas
- **Vendor Graph Workspace** — Debounced vendor search (220ms), multi-filter panel, active filter chips, subgraph visualization
- **Manual Audit Panel** — Vendor selector, case multi-select, severity buttons, notes/findings/recommendations form

### Landing Page

- **3D Compliance Brain** — Three.js scene with 170 nodes in brain + ring layout; morphs on scroll; risk nodes highlighted red; transmission material shell with chromatic aberration
- **Scroll-Linked Animations** — Framer Motion scroll-triggered reveals with staggered delays across 6 section panels

---

## API Reference

### Authentication

```
POST /auth/login          # Returns JWT token
POST /auth/users          # Create user (admin only)
```

### Data

```
POST /ingest              # Upload enterprise dataset
GET  /dataset/load        # Load simulated demo dataset
GET  /export/neo4j        # Export graph to Neo4j-compatible format
```

### Analysis

```
GET  /pipeline/run        # Run full analysis pipeline
GET  /cases               # List all investigation cases
GET  /cases/{id}          # Get case details + investigation report
GET  /cases/{id}/evidence # Download evidence ZIP bundle
```

### Rules

```
GET  /rules               # List all active rules
POST /rules/simulate      # What-if threshold simulation
```

### Audit

```
GET  /audit/chain/verify  # Verify full blockchain-style audit chain
GET  /audit/alerts        # List auditor conflict alerts
POST /audit/findings      # Submit manual audit finding
```

### Policies

```
GET    /policies                    # List company policies
POST   /policies                    # Create policy
POST   /policies/{id}/documents     # Upload policy document
POST   /policies/{id}/publish       # Publish policy version
```

### System

```
GET  /system/health       # System health snapshot
GET  /system/metrics      # Metrics registry (counters + gauges)
GET  /system/pipeline     # Pipeline deep-dive staged summary
POST /backup              # Trigger backup (admin only)
POST /backup/restore      # Restore from backup (admin only)
```

---

## Authentication & RBAC

Three roles with gated endpoint access via `require_roles()` FastAPI dependency:

| Role | Permissions |
|------|------------|
| `admin` | Full access including user provisioning, backup/restore, admin-only cases |
| `auditor` | Own findings, pipeline console, report writer, vendor workspace |
| `risk_analyst` | Case viewing, investigation reports, rule simulation |

**Account lockout:** 5 failed login attempts → 15-minute lockout (tracked via `locked_until` in SQLite)

**Bootstrap users** are auto-created from `BOOTSTRAP_USERS_JSON` on startup.

---

## Deployment

### Prerequisites

- Python 3.10+
- Node.js 18+
- SQLite3

### Backend

```bash
# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env

# Start the API server
uvicorn main:app --host 0.0.0.0 --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run build
npm start
```

### Docker (recommended)

```bash
docker-compose up --build
```

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `SECRET_KEY` | Yes | JWT signing key (HS256) |
| `FERNET_KEY` | Yes | Encryption key for SQLite data at rest |
| `BOOTSTRAP_USERS_JSON` | Yes | JSON array of initial users with roles |
| `ENABLE_EXTERNAL_AI` | No | `true` to enable hybrid AI mode (default: `false`) |
| `EXTERNAL_AI_API_KEY` | No | API key for OpenAI-compatible external AI |
| `EXTERNAL_AI_MODEL` | No | Model name (must be in governance whitelist) |
| `NEXT_PUBLIC_API_URL` | Yes | Backend API base URL for Next.js frontend |
| `NEXT_PUBLIC_DEMO_USERNAME` | No | Auto-fill demo credential on login page |
| `NEXT_PUBLIC_DEMO_PASSWORD` | No | Auto-fill demo credential on login page |

---

## Feature Summary

The platform ships **99 distinct features** across 18 subsystems:

| Subsystem | Features |
|-----------|---------|
| Authentication & Access Control | 7 |
| Data Ingestion & Validation | 3 |
| Graph Intelligence Engine | 8 |
| Governance Rule Engine | 8 |
| Risk Scoring & Trust Engine | 4 |
| Case Management & Investigation | 9 |
| Multi-Agent AI Orchestration | 6 |
| Auditor Integrity & Conflict Detection | 4 |
| Policy & Compliance Governance | 5 |
| Security Infrastructure | 9 |
| Persistence & Disaster Recovery | 4 |
| Observability & Monitoring | 5 |
| Frontend — Landing & Marketing | 5 |
| Frontend — Authentication | 3 |
| Frontend — Admin Dashboard | 8 |
| Frontend — Auditor Dashboard | 4 |
| Frontend — State & API | 5 |
| Report & Export | 3 |

---

## License

Proprietary. All rights reserved.

---

*Built with GenW.AI infrastructure — AppMaker · Agent Builder · Playground · Realm AI*