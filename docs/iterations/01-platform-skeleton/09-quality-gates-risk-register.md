# Iteration 01 - Quality Gates And Risk Register

## Hard Gates

1. NestJS monorepo builds.
2. Backend apps and shared libraries compile independently.
3. Local PostgreSQL, Kafka and optional RabbitMQ boot reliably.
4. Core migrations run from an empty database.
5. OpenAPI generation works.
6. Outbox and idempotency tables exist.
7. Architecture boundary tests exist.
8. Minimal REST flow persists tenant-scoped topics.

## Architecture Checks

- Domain libraries do not import NestJS, ORM or broker packages.
- Application services depend on repository and event ports.
- Persistence adapters implement ports.
- API DTOs map to commands and view models, not domain entities directly.
- Tenant context is required for every command/query.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Shared libs become a dumping ground | Architecture decay | Keep libs context/layer-specific. |
| Local infra is fragile | Developer slowdown | Add health checks and documented startup order. |
| Events publish outside transaction | Lost consistency | Use outbox from the beginning. |
| Idempotency is postponed | Duplicate commands/jobs | Add idempotency foundation before ingestion. |
| OpenAPI is manually maintained | Mobile/backend drift | Generate contract from source of truth. |

## Edge Cases To Recheck

- Duplicate create-topic request after retry.
- API gateway starts before dependencies.
- Migration partially applies.
- Tenant ID missing in internal service call.
- Event schema changes before consumers exist.

## Transition Criteria

Move to Iteration 02 only when the platform can create a topic through REST, persist it with tenant scope and publish/store events through the agreed foundation.
