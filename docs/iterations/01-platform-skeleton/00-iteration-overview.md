# Iteration 01 - Platform Skeleton Overview

## Goal

Create a production-shaped NestJS monorepo and local platform skeleton before building business features.

The outcome is not a demo API. It is a reliable foundation where services, libraries, contracts, tests, migrations and local infrastructure already enforce the architecture.

## Target Stack

- NestJS monorepo.
- TypeScript strict mode.
- PostgreSQL as primary relational store.
- Redis for short-lived locks/cache where needed.
- Kafka for durable event streams.
- RabbitMQ for task/work queues where command-style jobs fit better.
- gRPC for internal service-to-service calls where synchronous internal APIs are justified.
- REST/OpenAPI for frontend/backend boundary.
- WebSocket gateway later for realtime status.

## Service Boundaries For MVP

- `api-gateway` - REST/OpenAPI, auth, request validation, frontend boundary.
- `identity-service` - tenant/user/membership/auth state.
- `monitoring-service` - topics, source bindings, scan policies.
- `ingestion-worker` - source scan jobs, provider adapters, cursors.
- `intelligence-worker` - dedupe, relevance, AI summaries.
- `delivery-service` - notifications, digests, realtime events.

For the first code version, some services can run inside one monorepo process group, but boundaries must be represented as modules, ports and contracts.

## Physical Split Criteria

A boundary can become a separately deployed microservice only when all are true:

1. The bounded context owner is clear.
2. The service has stable input/output contracts.
3. Data ownership and migration responsibility are clear.
4. Consumers have contract tests.
5. Logs, traces, metrics and health checks identify the service separately.
6. There is a rollback or traffic-disable path.
7. The split solves an observed scaling, reliability, ownership or deployment problem.

Until then, prefer modular apps/libs inside the monorepo. This keeps delivery fast while preserving extraction paths.

## Transport Rules

- REST/OpenAPI: frontend/backend contract and public app API.
- Kafka: durable domain/integration events and replayable state changes.
- RabbitMQ: bounded job/command dispatch with explicit retry/dead-letter semantics.
- gRPC: internal synchronous service calls only after a concrete need is proven.

Every transport decision must have an owner, consumer list, versioning rule and failure behavior.

## Phase Map

1. `01-monorepo-scaffold.md` - workspace, apps, libs, linting and dependency boundaries.
2. `02-local-infrastructure.md` - Docker Compose, Postgres, Redis, Kafka, RabbitMQ.
3. `03-database-migrations.md` - schemas, migration policy, generated types.
4. `04-api-worker-bootstrap.md` - API gateway and worker bootstraps.

## Detailed Steps

1. Scaffold monorepo with `apps/*` and `libs/*`.
2. Create domain libs per bounded context.
3. Create application libs with use cases and ports.
4. Create infrastructure libs with adapters.
5. Create contract libs for OpenAPI DTOs, event DTOs and gRPC proto files.
6. Add dependency boundary checks so infra cannot leak into domain.
7. Add shared Result/Error primitives.
8. Add typed config module with env validation.
9. Add logging, trace id and request context middleware.
10. Add health/readiness endpoints.
11. Add migration workflow and seed data policy.
12. Add Docker Compose with stable local service names.
13. Add local scripts for `dev`, `test`, `lint`, `migrate`, `seed`.
14. Add smoke tests proving API and workers start.

## MVP Monorepo Layout Baseline

Use this first layout. It is intentionally modular, not over-split.

```text
apps/
  api-gateway/
  ingestion-worker/
  intelligence-worker/
  delivery-service/
libs/
  shared-kernel/
  contracts/
    rest/
    events/
    grpc/
  identity/
    domain/
    features/
    ports/
    adapters/
    interfaces/
  monitoring/
    domain/
    features/
    ports/
    adapters/
    interfaces/
  ingestion/
    domain/
    features/
    ports/
    adapters/
    interfaces/
  feed/
    domain/
    features/
    ports/
    adapters/
    interfaces/
  summary/
    domain/
    features/
    ports/
    adapters/
    interfaces/
  delivery/
    domain/
    features/
    ports/
    adapters/
    interfaces/
  usage/
    domain/
    features/
    ports/
    adapters/
    interfaces/
```

Layer rules:

1. `domain` imports only `shared-kernel` and local domain files.
2. `features` import local domain, context ports and shared kernel.
3. `ports` define repository/provider/broker/AI abstractions.
4. `adapters` implement ports and use external SDKs/framework clients.
5. `interfaces` map REST/jobs/events/WS to feature use cases.
6. `apps/*` compose modules, controllers, workers and adapters.
5. `contracts/*` contains DTO/schema/proto definitions and generated artifacts only.
6. No context imports another context's infrastructure.
7. Cross-context state changes happen through events, use-case orchestration or explicit read-model ports.

## First Vertical Slice

Build this slice before any real external provider:

1. Create workspace.
2. Create topic.
3. Bind fake source with capability profile.
4. Set scan policy.
5. Enqueue fake scan job.
6. Persist source item.
7. Create feed item.
8. Generate deterministic fake summary.
9. Publish realtime/status event.
10. Show operation status through REST.

This slice proves architecture, contracts, idempotency, outbox/inbox, tenant scope and generated-client compatibility before source-specific risk enters the system.

## Edge Cases

- Kafka starts after workers and subscriptions fail.
- RabbitMQ queue exists with old schema.
- Postgres migration partially applies.
- Local env has stale secrets.
- Two services use different event contract versions.
- gRPC proto changes without regenerated clients.
- API gateway validates DTO differently than domain use case.
- Feature library imports another feature's repository implementation.
- First worker scan succeeds but outbox dispatcher is offline.
- Generated OpenAPI differs between machines because schema generation order is unstable.
- Local reset deletes real developer secrets or uploaded fixtures.

## Pay Attention

- Do not create shared "god" libraries.
- Shared kernel must stay tiny: ids, clock, result, errors, event envelope.
- Use separate adapters for Kafka producer, RabbitMQ publisher, Postgres repository, AI provider and source providers.
- Keep migration ownership clear per bounded context.
- Start with fake source and fake AI adapter to prove the platform loop before spending provider quota.
- Keep physical microservice extraction criteria visible in PRs that add new apps or transports.

## Quality Gates

- `npm test` or equivalent runs unit tests for domain/use cases.
- `lint` catches forbidden imports across layers.
- Local infra starts from clean checkout.
- API OpenAPI JSON is generated deterministically.
- Health checks cover database and message brokers.
- Workers can start without performing scans.
- First vertical slice passes with fake source and fake summary provider.
- Import boundary check fails on domain -> Nest/ORM/broker imports.
- Idempotency tests cover duplicate command and duplicate event/job delivery.

## Done Criteria

The platform skeleton is complete when a new feature can be added by creating:

```text
domain entity -> use case -> port -> adapter -> API/event contract -> tests
```

without changing global architecture.
