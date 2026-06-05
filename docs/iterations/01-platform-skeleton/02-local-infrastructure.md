# Iteration 01 / Phase 02 - Local Infrastructure

## Objective

Provide reproducible local infrastructure for MVP development.

## Steps

1. Add Docker Compose with Postgres, Redis, RabbitMQ and object storage.
2. Add profiles for Kafka/OpenSearch but keep them disabled by default.
3. Add healthchecks and startup scripts.
4. Add local `.env.example` only.
5. Add migration runner and seed runner.
6. Add local reset scripts for DB, queues and storage.

## Edge Cases

- Service starts before Postgres is ready.
- Local volume state hides migration bug.
- Port conflicts on developer machine.
- Fake provider secrets accidentally committed.

## Pay Attention

- Compose is local only, not production architecture.
- Healthchecks must reflect readiness.
- Tests should not depend on persistent local volumes.

## Acceptance Criteria

- Fresh checkout can boot local stack.
- Reset command returns to known state.
- Seed creates demo tenant/topic/source.
- No real secrets in repo.
