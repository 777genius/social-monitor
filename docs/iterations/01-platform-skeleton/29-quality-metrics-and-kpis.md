# Iteration 01 - Quality Metrics And KPIs

## Primary Quality Signals

| Metric | Target |
| --- | --- |
| Monorepo build success | 100% |
| Clean database migration success | 100% |
| Architecture boundary test pass rate | 100% |
| OpenAPI generation reproducibility | 100% |
| Tenant-scoped baseline command coverage | 100% |

## Failure Signals

- Domain imports framework/infrastructure packages.
- Outbox or idempotency is deferred.
- OpenAPI is manually edited.

## Review KPI

Platform skeleton is healthy when topic creation works through REST and contract/migration checks are automated.
