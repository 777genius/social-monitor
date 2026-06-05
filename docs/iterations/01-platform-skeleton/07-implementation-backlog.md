# Iteration 01 - Implementation Backlog

## Purpose

Create the deployable skeleton: NestJS monorepo, shared contracts, local infrastructure, migrations and minimal service endpoints.

## Backend Backlog

1. Scaffold NestJS monorepo with apps:
   - `api-gateway`
   - `identity-service`
   - `topic-service`
   - `source-catalog-service`
   - `ingestion-service`
   - `feed-service`
   - `summary-service`
   - `notification-service`
2. Scaffold libraries:
   - `libs/domain`
   - `libs/application`
   - `libs/contracts`
   - `libs/adapters`
   - `libs/testing`
   - `libs/observability`
3. Add Clean Architecture import rules.
4. Add module boundaries for each bounded context.
5. Add base use case interfaces and result/error types.
6. Add domain event publisher port and no-op adapter.
7. Add repositories as ports, not direct ORM usage in use cases.

## Data Backlog

1. Add PostgreSQL migrations for tenants, users, workspaces, topics, source bindings, scan policies and audit log.
2. Add schema ownership convention per bounded context.
3. Add optimistic concurrency column to aggregates that will receive concurrent writes.
4. Add outbox table for transactional event publishing.
5. Add idempotency key table for command endpoints and worker jobs.

## Messaging Backlog

1. Add Kafka broker to local compose.
2. Add RabbitMQ to local compose if job dispatch is separated from event streaming.
3. Define topics/queues for first MVP:
   - `scan.scheduled`
   - `scan.completed`
   - `source_item.observed`
   - `feed_item.upserted`
   - `summary.requested`
   - `summary.completed`
4. Add event envelope fields: event ID, tenant ID, schema version, occurred at, correlation ID, causation ID.
5. Add local dead-letter topic/queue convention.

## API Backlog

1. Add REST endpoints for workspace bootstrap.
2. Add topic CRUD.
3. Add source catalog list.
4. Add source binding CRUD.
5. Add scan policy CRUD.
6. Add OpenAPI generation.
7. Add request validation and typed error responses.

## Frontend Backlog

1. Scaffold Flutter app structure.
2. Add generated API client setup.
3. Add base feature layout.
4. Add MobX store base conventions.
5. Add navigation shell.
6. Add environment switching.

## Edge Cases

- Migration runs twice in local and CI.
- API gateway starts before dependencies are ready.
- Event schema changes before consumers are deployed.
- A command succeeds in DB but event publish fails.
- Tenant ID is missing from internal service request.

## Validation

- `docker compose up` starts local platform.
- OpenAPI is generated.
- Health endpoints work.
- Architecture tests catch forbidden domain imports.
- A topic can be created through REST and persisted.
