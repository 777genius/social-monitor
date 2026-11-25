# Iteration 06 - Decision Log

## Decision 001 - Tenant Isolation Is A Launch Gate

- Decision: External beta cannot launch without tenant isolation tests.
- Alternatives: Rely on controller checks and manual review.
- Rationale: Multi-tenant architecture is a core requirement.
- Consequences: More test effort, lower catastrophic risk.
- Revisit When: Deployment is explicitly single-tenant.

## Decision 002 - Support Must Diagnose Without Shell Access

- Decision: Dashboards/runbooks must explain common failures before beta.
- Alternatives: Developer-led investigation for every incident.
- Rationale: Beta operations need repeatable support workflow.
- Consequences: Observability and runbooks are part of MVP, not polish.
- Revisit When: Beta is limited to internal developers only.
