# Iteration 01 - QA Acceptance Signoff

## Signoff Goal
Confirm that platform scaffolding is buildable, contract-safe and ready for ingestion.

## Acceptance Scenarios
- Monorepo build, lint and tests pass.
- Local infra starts and health checks pass.
- Migrations run from clean and upgraded database states.
- OpenAPI is generated.
- Outbox publishes after durable write.

## Negative Cases
- Duplicate command creates duplicate effect.
- Domain imports NestJS, ORM, broker or DTOs.
- Missing tenant context reaches protected use case.
- Migration breaks upgraded database.

## Regression Coverage
- Import-boundary tests.
- Migration tests.
- Idempotency tests.
- OpenAPI snapshot.

## Residual Risks
- Production deployment topology can remain deferred.
- Full observability can be completed in hardening.

## Approvers
- Backend lead.
- Platform owner.
- Contract owner.
- QA owner.
