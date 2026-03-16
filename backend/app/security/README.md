# Security Layer

Security controls for authentication, authorization, data protection, and API protection.

## Files
- `auth_handler.py`: Password policy, hashing, JWT issue/verify.
- `rbac.py`: Role-based access guards.
- `audit_logger.py`: Structured, hash-linked, HMAC-signed audit trail.
- `encryption.py`: Application-level payload encryption at rest.
- `api_guard.py`: Middleware for request IDs, rate limiting, size limits, security headers.

## Roles
- `admin`: Full governance control and sensitive visibility.
- `risk_analyst`: Operational analysis and workflow management.
- `auditor`: Restricted review-only access for published case outputs.
