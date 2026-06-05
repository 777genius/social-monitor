# Iteration 01 - Traceable Evidence Register

## Evidence Goal
Prove that the platform baseline is buildable, contract-safe and ready for ingestion.

## Critical Audit Evidence
- Tenant context propagates through REST, repositories, jobs and events.
- Outbox, inbox and idempotency evidence exists for write paths.
- OpenAPI generation and contract drift checks are reproducible.
- Architecture import tests block framework/ORM/broker/generated DTO leakage into domain.
- MVP tables have lifecycle fields, retention owner and migration compatibility notes.
- Contract compatibility evidence exists for OpenAPI diff, generated client, event/job schema and migration deploy compatibility.

## Decision Evidence
- Monorepo/module structure ADR.
- ORM/migration decision.
- Outbox/idempotency decision.
- Kafka/RabbitMQ boundary decision.

## Ticket Evidence
- Scaffold tickets link to build/lint/test output.
- Migration tickets link to clean and upgraded migration logs.
- OpenAPI tickets link to generated contract artifacts.
- Outbox tickets link to duplicate-command tests.

## Review Evidence
- PR review rubric completed.
- Architecture compliance audit has no critical violation.
- Contract dependency checklist accepted by ingestion/mobile owners.

## Handoff Evidence
- Ingestion owner accepts platform primitives.
- Local setup and migration commands are documented.

## Missing Evidence Blocks
- Domain boundary failure.
- Missing OpenAPI artifact.
- Missing idempotency proof for write path.
- Missing contract compatibility evidence for generated clients, events or migrations.
