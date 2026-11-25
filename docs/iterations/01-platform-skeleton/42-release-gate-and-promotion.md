# Iteration 01 - Release Gate And Promotion

## Promotion Goal
Approve movement from platform skeleton into ingestion implementation.

## Required Evidence
- Monorepo builds and tests pass.
- Import-boundary checks protect domain code.
- Local infra starts repeatably.
- Migrations run from clean and upgraded states.
- Outbox/idempotency behavior is demonstrated.
- OpenAPI is generated.

## Promotion Checks
- Domain has no framework or infrastructure imports.
- Controllers do not contain business rules.
- Events have version, tenant scope and idempotency metadata.
- Duplicate command handling is tested.

## Hold Conditions
- OpenAPI cannot be generated repeatably.
- Outbox/idempotency is incomplete.
- Migration path is unreliable.
- Shared libs are unowned or over-broad.

## Rollback Or Rework
- Rework module boundaries before connector code starts.
- Rework migrations before downstream persistence depends on them.
- Rework idempotency before workers are introduced.

## Approval
Platform may promote only when ingestion can use stable application ports, persistence and event foundations.
