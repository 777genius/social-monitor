# Iteration 01 - Backlog Prioritization Matrix

## Prioritization Goal
Build the minimum reliable platform foundation before feature or worker code depends on it.

## P0 - Do First
- Monorepo scaffold and import-boundary checks.
- Local infra baseline.
- Migration workflow.
- Outbox and idempotency.
- Generated OpenAPI baseline.

## P1 - Do After P0
- Health/readiness endpoints.
- Contract compatibility checks.
- Basic event envelope tests.
- Local developer documentation.

## P2 - Defer If Needed
- Production deployment topology.
- Full autoscaling.
- gRPC extraction.
- Advanced dashboards.

## Prioritize Higher When
- Work affects domain boundaries.
- Work affects persistence and migrations.
- Work affects public API or event contracts.
- Work affects duplicate command safety.

## Do Not Prioritize
- Infrastructure sophistication before reliable local baseline.
- Microservice deployment before module boundaries are stable.
- Feature endpoints before idempotency for write paths.
