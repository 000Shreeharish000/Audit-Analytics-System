# Domain Models

Pydantic schemas used across API, core services, persistence boundaries, and tests.

## Coverage
- Transaction entities: employee/vendor/invoice/approval/payment.
- Analytical entities: decision, rule result, case result, investigation report.
- Governance entities: company policies, policy versions, onboarding, alerts, assignments.
- Operations entities: backup/restore responses, case status updates, explainability responses.

## Contract Discipline
- Models define canonical field names and validation constraints.
- API routes and persistence adapters should use these models for consistency.
