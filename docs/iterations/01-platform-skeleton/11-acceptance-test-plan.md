# Iteration 01 - Acceptance Test Plan

## Acceptance Scenarios

1. Fresh checkout boots local PostgreSQL, Kafka and optional RabbitMQ.
2. Backend monorepo builds all apps and libraries.
3. Architecture tests fail when domain imports NestJS, ORM or broker code.
4. Migrations run from an empty database.
5. REST topic creation persists tenant-scoped topic.
6. OpenAPI is generated and includes workspace/topic/source-binding baseline endpoints.
7. Duplicate command with same idempotency key does not create duplicate topic.
8. Outbox record is created for a state-changing command.

## Negative Scenarios

1. Missing tenant context rejects command.
2. Invalid request body returns typed API error.
3. Service startup reports unhealthy dependency.
4. Migration failure is visible in CI.

## Regression Checks

- Generated OpenAPI remains compatible with mobile client generation.
- Core tables keep tenant scope.
- Shared libs do not violate layer boundaries.
- Event envelope fields remain present.

## Pass Criteria

Platform skeleton is accepted when a topic can be created through REST in a clean local environment and all architecture/migration/contract checks pass.
