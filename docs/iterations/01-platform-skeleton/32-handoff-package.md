# Iteration 01 - Handoff Package

## Handoff To

- `02-ingestion-connectors`

## Delivered Artifacts

- NestJS monorepo skeleton.
- Local infrastructure.
- Core migrations.
- Outbox and idempotency foundation.
- Baseline REST/OpenAPI.
- Architecture tests.

## Contracts To Carry Forward

- Tenant context is required.
- Outbox is used for state-changing events.
- OpenAPI is generated.
- Domain does not import infrastructure.

## Open Risks

- RabbitMQ vs Kafka worker split may require refinement.
- Auth provider details may affect mobile/session flow.
- Schema ownership must stay context-specific.

## Required Validation Before Next Iteration

- Topic create REST smoke passes.
- Clean DB migration passes.
- OpenAPI generation passes.
- Ingestion can rely on outbox/idempotency primitives.
