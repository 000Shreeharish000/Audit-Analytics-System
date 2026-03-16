# Scripts

Operational utility scripts for local validation and CI parity.

## `security_quality_gate.ps1`

Runs the prototype quality gate in sequence:

1. `ruff` static lint
2. `mypy` type validation
3. `bandit` medium+ severity security scan
4. `pip-audit` dependency audit (with tracked exceptions)

Use:

```powershell
powershell -File scripts\security_quality_gate.ps1
```
