# Iteration 01 - Ticket Breakdown

## Phase 01 - Monorepo Scaffold

### T01-01 - Scaffold NestJS Workspace

- Context: Platform
- Layer: Infrastructure/application shell
- Artifacts: NestJS monorepo apps and libs
- Steps:
  1. Create backend monorepo structure.
  2. Add service apps for API gateway, identity, topic, source catalog, ingestion, feed, summary and notification.
  3. Add shared libs for domain, application, contracts, adapters, testing and observability.
  4. Add lint, formatting and typecheck scripts.
- Edge cases:
  - Shared libs become dumping ground.
  - Service boundaries are copied without ownership.
- Acceptance:
  - Empty services build independently.

### T01-02 - Add Architecture Boundary Tests

- Context: Platform
- Layer: Tests
- Artifacts: dependency rules, forbidden import tests
- Steps:
  1. Enforce domain has no NestJS/ORM/broker imports.
  2. Enforce use cases depend only on ports.
  3. Enforce adapters do not import other adapters.
  4. Enforce frontend feature boundary plan is documented.
- Edge cases:
  - Generated code is placed in domain.
  - Test rules block legitimate contract imports.
- Acceptance:
  - CI fails on forbidden layer dependency.

## Phase 02 - Local Infrastructure

### T01-03 - Compose Local Platform

- Context: DevOps
- Layer: Infrastructure
- Artifacts: docker compose, env templates, health checks
- Steps:
  1. Add PostgreSQL.
  2. Add Kafka.
  3. Add RabbitMQ if job dispatch is separated.
  4. Add local observability placeholders.
  5. Add startup health checks.
- Edge cases:
  - Services start before broker/database readiness.
  - Local ports conflict.
- Acceptance:
  - Fresh checkout can boot local dependencies.

## Phase 03 - Database Migrations

### T01-04 - Create Core Schema

- Context: Identity/Workspace/Topic/Source
- Layer: Persistence adapter
- Artifacts: migrations, repository ports, persistence adapters
- Steps:
  1. Create tenant/workspace/user tables.
  2. Create topic/source binding/scan policy tables.
  3. Add outbox and idempotency tables.
  4. Add audit log table.
  5. Add optimistic concurrency where aggregates can race.
- Edge cases:
  - Topic deleted while related jobs exist.
  - Migration leaves partially initialized state.
- Acceptance:
  - Migrations run cleanly twice in CI from empty database.

## Phase 04 - API Worker Bootstrap

### T01-05 - Expose Minimal REST Flow

- Context: API Gateway/Topic
- Layer: API adapter/application
- Artifacts: OpenAPI, controllers, use cases
- Steps:
  1. Add workspace bootstrap endpoint.
  2. Add topic create/list/update.
  3. Add source catalog list placeholder.
  4. Add source binding create/list/update.
  5. Generate OpenAPI.
- Edge cases:
  - Tenant ID omitted from request.
  - Duplicate create command after retry.
- Acceptance:
  - Topic can be created through REST and persisted with tenant scope.
