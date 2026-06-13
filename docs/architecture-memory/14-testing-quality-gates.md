# Testing & Quality Gates

Date: 2026-05-31
Status: baseline testing memory

## Decision

Use layered testing. Unit tests alone are not enough for this platform.

## Test Layers

Unit:

- domain rules;
- value objects;
- pure use cases;
- source mapping functions;
- prompt/schema builders.

Integration:

- repositories with Postgres;
- outbox/inbox behavior;
- RabbitMQ queue handlers;
- Kafka event consumers;
- connector adapters with fake/provider sandbox;
- summary model adapter with fake model.

Contract:

- REST OpenAPI compatibility;
- event schema compatibility;
- protobuf breaking-change checks;
- generated Flutter client smoke test;
- problem+json error schema test.

E2E:

- HN/RSS scan -> normalized item -> summary -> feed;
- user topic subscription flow;
- retry/idempotency flow;
- webhook delivery/replay flow;
- summary rule preview/save flow.

Load:

- scheduler load;
- connector worker queue pressure;
- summary job throughput;
- feed pagination;
- webhook delivery retry pressure.

## Tools

Use:

- Testcontainers for Postgres/Redis/Rabbit/Kafka integration tests;
- k6 for load/performance tests;
- Pact where consumer-driven contract testing adds value;
- OpenAPI diff in CI;
- Buf for protobuf breaking checks.

References:

- Testcontainers Node.js: https://node.testcontainers.org/
- Grafana k6: https://grafana.com/docs/k6/latest/
- Pact: https://docs.pact.io/
- Buf breaking: https://buf.build/docs/breaking/

## Execution Cadence

Implementation should not stall on broad test suites. For MVP work, write code in coherent vertical slices and test in batches:

- use fast deterministic unit tests for domain/use-case/adapter behavior;
- use smoke scripts for expensive end-to-end paths when they prove the same wiring faster than Jest startup;
- run targeted Jest e2e for changed REST/worker contracts, not the whole e2e suite after every small edit;
- keep `npm test` and `npm run test:e2e` behind a hard timeout wrapper so leaked handles fail visibly.
- keep provider certification as a deterministic no-network smoke gate through `npm run check:source-certification`.

Full e2e and load gates remain release/promotion gates, not the default inner development loop.

## Quality Gates

CI must block:

- feature use cases without focused sibling specs;
- feature use-case specs that do not reference their exported use case or contain no executable test;
- committed `.only` or `.skip` tests;
- feature use cases that throw `DomainError` instead of returning `Result` failures;
- REST controllers that skip tenant/workspace scope unless explicitly allowlisted as public catalog endpoints;
- production `console.*` logging in `apps` or `libs`;
- breaking OpenAPI changes without migration note;
- breaking event/protobuf schemas;
- migrations without tests/review;
- connector changes without certification tests;
- `enabled_beta` source providers without a current `ops/ingestion/source-provider-certification.json` artifact;
- prompt/model changes without eval gate;
- unsafe commands without idempotency support;
- new large collections without cursor pagination.

## Locked Decisions

1. Contract tests are mandatory.
2. Integration tests must use real infrastructure through Testcontainers where practical.
3. k6 load tests are required before production scaling claims.
4. Connector certification is a release gate.
5. Prompt/model eval is a release gate.
6. `npm run check:code-quality` is mandatory before release evidence can pass.
