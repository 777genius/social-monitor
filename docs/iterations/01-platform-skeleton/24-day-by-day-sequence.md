# Iteration 01 - Day By Day Sequence

## Day 1 - Monorepo Skeleton

- Scaffold NestJS apps/libs.
- Add lint/typecheck/test scripts.
- Add architecture test skeleton.
- Check: empty apps build.

## Day 2 - Local Infrastructure

- Add PostgreSQL.
- Add Kafka.
- Add RabbitMQ if needed.
- Add health checks.
- Check: fresh checkout boots.

## Day 3 - Core Schema

- Add tenant/workspace/topic/source-binding migrations.
- Add outbox.
- Add idempotency.
- Check: migrations run from empty database.

## Day 4 - Baseline API

- Add topic/source baseline REST endpoints.
- Generate OpenAPI.
- Add typed error responses.
- Check: tenant-scoped topic create works.

## Day 5 - Closure Review

- Run architecture tests.
- Run migration check.
- Run API smoke.
- Stop if OpenAPI generation or idempotency is unstable.
