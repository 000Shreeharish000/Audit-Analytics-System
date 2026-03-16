# Backend Workspace

This folder contains the runnable backend service and test suite.

## Structure
- `app/`: FastAPI application source code.
- `tests/`: Unit and integration tests for rules, pathways, governance, and security controls.
- `requirements-dev.txt`: Development-only tools (linting, typing, security scans).
- `pyproject.toml`: Ruff and mypy configuration.
- `scripts/`: Operational scripts (quality/security gate).

## Run
1. `pip install -r ..\requirements.txt`
2. `cd backend`
3. `uvicorn app.main:app --reload --env-file ..\\.env`

## Validate
- `python -m pytest -q`
- `python -m compileall app`
- `powershell -File scripts\security_quality_gate.ps1`

Known dependency-audit exceptions are tracked in `SECURITY_EXCEPTIONS.md`.
