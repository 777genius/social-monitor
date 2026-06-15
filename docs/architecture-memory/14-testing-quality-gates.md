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
- keep realtime replay and delivery idempotency as a deterministic no-network smoke gate through `npm run check:delivery-replay`.
- keep the backend MVP core loop, feedback submission and source binding pause/resume as a deterministic no-network smoke gate through `npm run check:mvp-core-loop`.
- keep unsupported/deferred source scope policy as a deterministic no-network smoke gate through `npm run check:beta-scope-policy`.
- keep beta ring expansion policy as an executable contract through `npm run check:beta-ring-policy`.
- keep runtime persistence readiness as an executable contract through `npm run check:persistence-readiness`; in-memory/noop runtime adapters must be declared with owner, risk and durable replacement plan.
- keep monitoring Prisma persistence adapters covered by `npm run check:monitoring-persistence`, including persisted source binding pause state, scan policy `nextRunAt` and scan job status transitions.
- keep ingestion/feed Prisma persistence adapters covered by `npm run check:ingestion-feed-persistence`, including source item dedupe, scan cursor roundtrip, feed canonical dedupe, feed item rehydration, scan failure queue persistence, scan attempt persistence, scan lease fencing/release behavior, feed persistence mode validation, ingestion-worker persistence mode validation and ingestion-support persistence mode validation.
- keep summary Prisma persistence adapters covered by `npm run check:summary-persistence`, including summary job transitions, artifact payload rehydration, pagination, feedback evidence and summary persistence mode validation.
- keep identity Prisma persistence adapters covered by `npm run check:identity-persistence`, including API key create/list/verify/revoke, scope enforcement, revoked-key rejection, no secret-hash exposure and identity persistence mode validation.
- keep usage Prisma persistence adapters covered by `npm run check:usage-persistence`, including public API audit redaction/listing, rate-limit bucket counting, quota bucket reservation and usage persistence mode validation.
- keep delivery attempt Prisma persistence adapters covered by `npm run check:delivery-persistence`, including idempotent queueing, full state rehydration, list pagination, terminal failure state and delivery persistence mode validation.

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
- runtime modules adding in-memory or noop state adapters without persistence-readiness evidence;
- monitoring persistence changes that lose `nextRunAt`, source binding status or source catalog provider rehydration;
- summary persistence changes that lose job idempotency/status transitions, artifact payload rehydration or feedback evidence;
- identity persistence changes that expose API key hashes, lose scope enforcement or accept revoked keys;
- usage persistence changes that lose audit redaction, rate-limit windows or quota rejection behavior;
- delivery attempt persistence changes that lose idempotency scope, retry counters, transition timestamps or terminal failure semantics;
- connector changes without certification tests;
- `enabled_beta` source providers without a current `ops/ingestion/source-provider-certification.json` artifact;
- delivery/realtime changes without replay-window, resync and idempotency evidence;
- broken topic/source/scan/feed/summary/feedback/realtime vertical flow;
- paused source bindings accepting new scan work or spending quota;
- unsupported/deferred source providers becoming beta-bindable without readiness approval;
- beta ring expansion without capacity, cost, source-health and degradation evidence;
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
7. `npm run check:mvp-core-loop` is mandatory before beta MVP release evidence can pass, including feedback category, owner, evidence capture and source binding pause/resume behavior.
8. `npm run check:beta-scope-policy` is mandatory before beta MVP release evidence can pass.
9. `npm run check:beta-ring-policy` is mandatory before beta MVP release evidence can pass.
10. `npm run check:persistence-readiness` is mandatory before beta MVP release evidence can pass; external beta remains blocked while runtime state is only in-memory/noop-backed.
11. `npm run check:monitoring-persistence` is mandatory before beta MVP release evidence can pass.
12. `npm run check:ingestion-feed-persistence` is mandatory before beta MVP release evidence can pass.
13. `npm run check:summary-persistence` is mandatory before beta MVP release evidence can pass.
14. `npm run check:identity-persistence` is mandatory before beta MVP release evidence can pass.
15. `npm run check:usage-persistence` is mandatory before beta MVP release evidence can pass.
16. `npm run check:delivery-persistence` is mandatory before beta MVP release evidence can pass.
