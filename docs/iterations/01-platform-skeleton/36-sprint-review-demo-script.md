# Iteration 01 - Sprint Review Demo Script

## Review Goal
Prove that the platform skeleton is buildable, contract-driven and protected by clean boundaries.

## Demo Flow
1. Run monorepo build/test/lint.
2. Start local infrastructure and show health checks.
3. Run migrations from a clean database.
4. Show generated OpenAPI artifact.
5. Demonstrate outbox/idempotency behavior with a duplicate command.

## Evidence To Show
- Domain modules do not import NestJS, ORM or broker packages.
- Local infra startup is documented.
- Migration workflow is repeatable.
- OpenAPI is generated from code.
- Outbox records survive process restart.

## Edge Cases To Exercise
- Duplicate command is submitted twice.
- Service crashes after database write but before event publish.
- Tenant context is missing or invalid.

## Review Questions
- Can ingestion work start without changing platform boundaries?
- Are generated contracts usable by Flutter tooling?
- Are failure modes observable enough for local development?

## Accept Progress If
- Build and boundary checks pass.
- Outbox/idempotency are functional.
- Contract generation is stable.
