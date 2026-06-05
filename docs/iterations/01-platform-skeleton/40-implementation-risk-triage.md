# Iteration 01 - Implementation Risk Triage

## Triage Goal
Detect platform risks before they create hard-to-reverse coupling.

## Critical Risks
- Domain imports framework or infrastructure dependencies.
- Shared libraries become unowned common buckets.
- Outbox/idempotency is deferred.
- OpenAPI generation drifts from runtime behavior.

## Early Warning Signals
- Controllers contain branching business rules.
- ORM entities are passed into application use cases.
- Events lack version, tenant scope or idempotency key.
- Migration changes are tested only on clean databases.

## Owners
- Backend lead owns boundary enforcement.
- Platform owner owns local infra and migration reliability.
- Contract owner owns OpenAPI generation.
- QA owner owns duplicate-command and migration tests.

## Mitigations
- Add import-boundary checks early.
- Keep shared libs small and owner-labeled.
- Implement outbox/idempotency before workers.
- Run migrations against clean and upgraded databases.

## Stop-Work Triggers
- Domain depends on NestJS, ORM, broker or DTO packages.
- Duplicate command creates duplicate durable effects.
- API contract cannot be generated repeatably.

## MVP Risk Cutline
- Fix now: boundary violations, migration unreliability, missing tenant scope and missing outbox/idempotency.
- Carry with owner: production deployment depth and advanced observability.
- Defer: physical service extraction unless runtime evidence exists.
