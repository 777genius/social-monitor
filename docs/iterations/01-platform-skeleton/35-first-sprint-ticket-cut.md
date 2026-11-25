# Iteration 01 - First Sprint Ticket Cut

## Sprint Objective
Create a buildable NestJS monorepo baseline with clean boundaries, local infra, contracts, persistence and event foundations.

## Ticket 1 - Monorepo Scaffold
- Create apps/libs layout for API gateway, domain modules, application services and adapters.
- Add lint/test/build commands.
- Acceptance: empty scaffold builds and enforces import boundaries.
- Edge cases: shared libs must have explicit ownership and purpose.

## Ticket 2 - Local Infrastructure
- Add local PostgreSQL, Kafka, RabbitMQ and supporting services.
- Add documented startup and health checks.
- Acceptance: local dev can run the platform baseline repeatably.
- Edge cases: local-only defaults must not leak into production config.

## Ticket 3 - Persistence And Migrations
- Create tenant-aware core tables and migration workflow.
- Add migration rollback expectations.
- Acceptance: migrations run from clean database and existing database.
- Edge cases: tenant ownership must be explicit in every relevant table.

## Ticket 4 - Outbox And Idempotency
- Implement durable outbox baseline and idempotency key storage.
- Add worker-safe publishing behavior.
- Acceptance: duplicate commands do not create duplicate effects.
- Edge cases: crash between write and publish must be recoverable.

## Ticket 5 - Baseline REST/OpenAPI
- Add health, identity stub, workspace/topic baseline endpoints.
- Generate OpenAPI artifact.
- Acceptance: generated contract can be consumed by mobile/client tooling.
- Edge cases: controller DTOs must not become domain models.

## No-Go Criteria
- Domain imports NestJS, ORM or broker APIs.
- OpenAPI is manually patched.
- Outbox/idempotency is deferred.
