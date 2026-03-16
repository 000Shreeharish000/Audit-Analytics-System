# Data Assets

This folder stores runtime and demo data.

## Contents
- `simulated_enterprise_dataset.json`: Demo dataset with built-in control-bypass and social-link scenarios.
- `platform_state.db`: Encrypted SQLite state store (created at runtime).
- `audit_trail.jsonl`: Tamper-evident structured audit chain (created at runtime).
- `backups/`: Snapshot folders from manual/automatic backup events.

## Operational Guidance
- Treat runtime files as sensitive.
- For demos, you can clear runtime artifacts and re-load via `/dataset/load`.
