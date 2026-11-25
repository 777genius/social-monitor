# Iteration 01 - MVP Scope Guardrails

## In Scope

1. NestJS monorepo skeleton.
2. Local infrastructure.
3. Core schema.
4. Outbox/idempotency foundation.
5. Baseline REST/OpenAPI.
6. Architecture tests.

## Out Of Scope

1. Full physical microservice deployment.
2. All production SRE dashboards.
3. Advanced auth providers.
4. Real source adapters beyond placeholders.

## Scope Creep Signals

- A new service is created without stable bounded context need.
- Infra work blocks topic/source baseline APIs.
- Schema expands beyond core MVP entities.

## Decision Rule

Accept platform work only if it enables ingestion, feed, summaries or mobile contracts.

## Complexity Budget

- Build deeply: monorepo boundaries, local infra, migrations, outbox/idempotency, OpenAPI and architecture tests.
- Define lightly: gRPC proto ownership, physical service extraction criteria and future deployment boundaries.
- Defer: full independent deployment topology, advanced auth provider matrix, mature SRE platform and all optional infrastructure.
