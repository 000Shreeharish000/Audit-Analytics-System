Param(
    [switch]$SkipAudit
)

$ErrorActionPreference = "Stop"

Write-Host "Running quality gate checks..."

python -m ruff check app tests
python -m mypy app
python -m bandit -q -r app -ll

if (-not $SkipAudit) {
    python -m pip_audit -r ..\requirements.txt --ignore-vuln GHSA-7f5h-v6xp-fcq8 --ignore-vuln GHSA-wj6h-64fc-37mp
}

Write-Host "Quality gate passed."
