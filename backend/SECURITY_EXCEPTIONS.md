# Security Audit Exceptions

The CI dependency audit currently ignores the following advisories:

- `GHSA-7f5h-v6xp-fcq8` (`starlette`)
- `GHSA-wj6h-64fc-37mp` (`ecdsa`)

## Rationale

- `starlette`: FastAPI pin compatibility in this prototype currently constrains direct upgrade path.
- `ecdsa`: Advisory currently has no published fixed version available from upstream.

## Control Measures

- Inputs are still validated by strict API schemas.
- Security middleware, RBAC, JWT validation, and tamper-evident audit trails remain enforced.
- Exceptions are explicit and tracked so they can be removed as soon as patched releases are viable.
