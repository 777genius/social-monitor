# Iteration 01 - Risk Burndown And Control Points

## Burndown Goal
Reduce architecture and reliability risk before ingestion workers exist.

## Day 1 Control Point
- Monorepo structure is agreed.
- Import-boundary rule is defined.
- Local infra scope is fixed.

## Midpoint Control Point
- Migrations run from clean database.
- OpenAPI generation works.
- Outbox/idempotency implementation is in progress or proven with tests.

## Closeout Control Point
- Domain boundary checks pass.
- Duplicate command behavior is safe.
- Ingestion can use stable contracts, migrations and outbox primitives.

## Escalation Threshold
Escalate if any worker or adapter work would need to bypass application ports or idempotency rules.

## Residual Risk Rule
Deployment depth may carry forward; boundary, migration and idempotency risks may not.
