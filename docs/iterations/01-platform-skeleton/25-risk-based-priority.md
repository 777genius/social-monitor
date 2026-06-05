# Iteration 01 - Risk-Based Priority

## Priority 1 - Architecture Boundary Tests

- Risk: Clean Architecture is violated before feature work starts.
- Do First: Enforce forbidden imports.
- Do Not Defer: Domain isolation checks.

## Priority 2 - Outbox And Idempotency

- Risk: Event-driven ingestion creates lost events or duplicate commands.
- Do First: Add outbox and idempotency tables.
- Do Not Defer: Retry-safe command foundation.

## Priority 3 - OpenAPI Generation

- Risk: Flutter integration starts from unstable manual contracts.
- Do First: Generate OpenAPI and check diffs.
- Do Not Defer: Mobile contract source of truth.

## Priority 4 - Local Infrastructure Reliability

- Risk: All lanes slow down on flaky local setup.
- Do First: Health checks and clean boot.
