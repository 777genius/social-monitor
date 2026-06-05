# 257 - Integration Testing Testcontainers Policy

## Decision

Integration tests use real dependencies through Testcontainers where practical.

Mocks are for ports and edge cases; core persistence, queues and provider-adapter behavior need realistic containers.

## Sources

- Testcontainers Node.js: https://node.testcontainers.org/
- Testcontainers PostgreSQL module: https://testcontainers.com/modules/postgresql/
- Testcontainers Redis module for Node.js: https://node.testcontainers.org/modules/redis/
- Testcontainers RabbitMQ module for Node.js: https://node.testcontainers.org/modules/rabbitmq/

## What Uses Testcontainers

Required integration tests:

- repository adapters against Postgres
- migration smoke tests
- Redis cache/rate/lease adapter tests
- RabbitMQ job publish/consume/ack/DLQ tests
- source adapter fixture persistence tests
- outbox/inbox tests
- idempotency tests

Optional:

- Kafka event stream tests
- OpenSearch projection tests
- object storage tests

## Why Not Only Mocks

Mocks miss:

- SQL constraints
- transaction behavior
- RLS policy behavior
- index-specific query behavior
- queue ack/requeue behavior
- Redis TTL/eviction semantics
- serialization errors

The architecture depends on these behaviors.

## Test Scope

Keep test layers separate:

- unit tests: pure use cases, fake ports
- adapter integration tests: one real dependency
- workflow integration tests: small dependency set
- E2E tests: full local stack, limited count

Do not turn every test into a slow full-stack test.

## Container Lifecycle

Prefer one container per test file/suite for speed where isolation is preserved.

Each test should isolate data by:

- unique tenant id
- transaction rollback where suitable
- schema reset
- queue purge
- deterministic object prefix

## CI Requirements

CI runners must support Docker or an equivalent Testcontainers-compatible runtime.

If CI cannot run containers, that environment is not sufficient for backend merge gates.

## Seed Data

Integration tests seed minimal data through builders/factories.

Do not rely on production-like giant dumps for normal CI.

## Failure Debugging

On failure, tests should expose:

- container logs
- connection URL redacted
- migration output
- failed query/job id
- trace id where available

## Architecture Rule

If an adapter relies on behavior from Postgres, Redis, RabbitMQ or Kafka, test it against that behavior.
