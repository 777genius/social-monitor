# Iteration 01 - Test Fixtures And Scenarios

## Purpose
Define platform fixtures that prove the skeleton is buildable, tenant-aware and contract-safe.

## Core Fixtures
- Clean database with baseline migrations.
- Upgraded database with previous migration state.
- Tenant/workspace/topic records.
- Duplicate command with same idempotency key.
- Outbox event pending, published and failed states.

## Happy Path Scenarios
- Monorepo build, lint and tests pass.
- Migration runs from clean database.
- API endpoint generates OpenAPI contract.
- Command writes data and publishes event through outbox.

## Negative Scenarios
- Duplicate command is submitted twice.
- Missing tenant context reaches application service.
- Migration rollback/upgrade path fails.
- Controller DTO is passed as domain object.

## Edge Cases
- Process crashes after database write before publish.
- Local infra starts with stale volumes.
- Contract generation changes field order or optionality.

## Regression Seeds
- Import-boundary violation sample.
- OpenAPI generated artifact snapshot.
- Duplicate-command idempotency case.
