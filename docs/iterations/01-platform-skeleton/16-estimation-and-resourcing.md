# Iteration 01 - Estimation And Resourcing

## Relative Effort

- Complexity: High
- Risk: High if architecture tests/outbox/idempotency are deferred
- Recommended duration: 1-2 sprints

## Required Roles

- Backend platform engineer
- Data/migration owner
- DevOps/SRE
- API contract owner
- Mobile client owner for OpenAPI feedback

## Parallel Work

1. Monorepo scaffold can run with local infra.
2. Migration design can run with REST contract skeleton.
3. Flutter shell can start after OpenAPI direction is stable.

## Bottlenecks

- Local infra instability slows all lanes.
- OpenAPI instability blocks mobile.
- Missing outbox/idempotency blocks ingestion.

## No-Cut Areas

- Architecture boundary tests.
- Tenant context.
- Migrations from clean database.
- OpenAPI generation.
- Outbox/idempotency foundation.
