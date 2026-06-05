# 123. Contract and Integration Testing

## Status

Locked for quality baseline.

## Research Anchors

- Pact documentation: https://docs.pact.io/
- Pact JavaScript consumer tests: https://docs.pact.io/implementation_guides/javascript/docs/consumer
- Testcontainers Node.js: https://node.testcontainers.org/

## Decision

Use layered tests: unit tests for domain/use cases, contract tests for boundaries, Testcontainers for real infrastructure behavior, and a small number of end-to-end journeys.

## Test Matrix

| Layer | Purpose | Tools |
|---|---|---|
| domain unit | business rules, entities, value objects | Jest/Vitest |
| application use case | ports mocked, policy behavior | Jest/Vitest |
| adapter contract | source adapters, storage adapters | fixtures + contract suite |
| REST contract | Flutter/TS assumptions vs API | OpenAPI checks and Pact where useful |
| event contract | producer/consumer schema compatibility | Schema Registry compatibility tests |
| integration | Postgres/Redis/Kafka/Rabbit behavior | Testcontainers |
| e2e smoke | critical user journeys | minimal Playwright/API tests |

## Required Integration Tests

Before beta:

- topic creation emits outbox event;
- scheduler enqueues due scan once;
- source fake adapter fetches and normalizes;
- duplicate event does not duplicate item;
- summary job respects idempotency;
- tenant authorization blocks cross-tenant reads;
- source quota exhaustion records skip event;
- webhook delivery retry reaches DLQ after policy.

## Best-Fact Choice

Mocks alone are not enough for Kafka/Rabbit/Postgres correctness. Full e2e alone is too slow and brittle. Contract tests plus focused Testcontainers give the best cost-to-confidence ratio.

