# Workflows

## `security-quality.yml`

Runs backend quality and security checks on push/PR:

1. Install runtime and dev dependencies.
2. Run `ruff` lint.
3. Run `mypy` type checks.
4. Run `bandit` code security scan.
5. Run `pip-audit` dependency scan with tracked exceptions.

This mirrors `backend/scripts/security_quality_gate.ps1` to keep local and CI behavior consistent.
