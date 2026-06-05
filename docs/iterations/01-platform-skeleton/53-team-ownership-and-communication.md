# Iteration 01 - Team Ownership And Communication

## Communication Goal
Keep platform, contract and persistence decisions aligned before ingestion depends on them.

## Decision Owners
- Backend lead: module boundaries and Clean Architecture enforcement.
- Platform owner: local infrastructure and migrations.
- Contract owner: OpenAPI and event envelope.
- Reliability owner: outbox and idempotency.

## Reviewers
- Ingestion lead reviews worker and event readiness.
- Mobile lead reviews generated client usability.
- QA owner reviews migration and duplicate-command coverage.

## Sync Points
- Kickoff: confirm scaffold and tooling.
- Midpoint: review migrations, outbox and OpenAPI.
- Closeout: confirm ingestion readiness.

## Escalate When
- Domain boundary is violated.
- Migration strategy changes.
- Event envelope or API contract changes.
- Outbox/idempotency is bypassed.

## Handoff Message
Platform is ready when ingestion can rely on stable ports, local infra, migrations, idempotency and generated contracts.
