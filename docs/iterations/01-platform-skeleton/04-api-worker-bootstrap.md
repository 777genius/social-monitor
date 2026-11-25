# Iteration 01 / Phase 04 - API And Worker Bootstrap

## Objective

Wire API, worker, queues and basic health/observability.

## Steps

1. Add global validation pipe with whitelist/forbid unknown.
2. Add Problem Details exception filter.
3. Add request context with tenant/user/correlation id.
4. Add RabbitMQ job publishing/consuming adapter.
5. Add outbox/inbox skeleton.
6. Add structured logging and OpenTelemetry bootstrap.
7. Add readiness/liveness endpoints.
8. Add command idempotency middleware or use-case guard for write endpoints.
9. Add outbox dispatcher skeleton with retry and visibility.
10. Add inbox dedupe skeleton for event/job consumers.
11. Add graceful shutdown checkpoint rules for workers.

## Bootstrap Order

Implement in this order to avoid hidden coupling:

1. `ConfigModule`: typed env validation, safe defaults for local, no secrets in logs.
2. `RequestContextModule`: correlation id, tenant/workspace/user placeholders, trace propagation.
3. `ProblemDetailsModule`: exception filter, stable error mapper, field-level validation errors.
4. `OpenApiModule`: deterministic schema generation and contract export command.
5. `DatabaseModule`: connection, transaction boundary, migration readiness check.
6. `OutboxModule`: transactional write API and dispatcher skeleton.
7. `InboxModule`: processed event/job guard and replay-safe side-effect boundary.
8. `BrokerModule`: Kafka event publisher/consumer and RabbitMQ job publisher/consumer adapters.
9. `HealthModule`: liveness/readiness with dependency classification.
10. `WorkerRuntimeModule`: graceful shutdown, lease handling, retry/dead-letter hooks.

## First API Commands

Use the fake-source vertical slice only:

1. `CreateWorkspaceCommand`
2. `CreateTopicCommand`
3. `BindSourceCommand`
4. `SetScanPolicyCommand`
5. `RequestScanCommand`
6. `RequestSummaryCommand`
7. `SubmitSummaryFeedbackCommand`

Each command must:

- carry tenant/workspace/user context explicitly
- accept or derive an idempotency key
- return a stable application result DTO
- map domain errors to Problem Details at the API edge
- write events through outbox when state changes

## Outbox/Inbox Contract

- State-changing use cases write domain state and outbox event in the same transaction.
- Outbox dispatcher publishes only committed events.
- Published events include event id, version, tenant/workspace scope, correlation id, causation id and idempotency key where relevant.
- Consumers record processed event/job ids in inbox before side effects are considered complete.
- Retry attempts are bounded and visible.
- Dead-letter entries contain tenant/workspace, event/job id, failure class and correlation id.

## Worker Checkpoint Rules

1. Claim job lease before external/provider/AI work.
2. Re-check tenant/source/topic enabled state after claiming lease.
3. Run quota preflight before costly external calls.
4. Persist source/feed/summary state before acknowledging job.
5. Write outbox event in the same transaction as state mutation.
6. Record inbox/job checkpoint before side effects are considered complete.
7. On crash, retry from durable state, not from in-memory cursor.
8. Dead-letter only after bounded retries and failure classification.

## REST Error Contract

- Validation errors return Problem Details with field-level safe details.
- Domain errors map to stable `code` values, not provider/database exception names.
- Retryable errors include recovery action and retry hint when safe.
- Authorization failures do not reveal whether another tenant's resource exists.
- Internal failures include correlation id and safe title/detail only.

## Contract Artifact Rules

1. OpenAPI is generated from code and never manually patched.
2. Every REST response DTO has mapper tests for domain/application result -> API DTO.
3. Every write endpoint has Problem Details examples for validation, authorization, quota/source failure and internal failure.
4. Every event/job payload has schema version, tenant/workspace scope, correlation id, causation id and idempotency key where applicable.
5. OpenAPI diff classifies changes as safe additive, risky additive or breaking.
6. Generated Flutter client is regenerated in CI when OpenAPI changes and must stay behind mobile infrastructure mappers.
7. Event schema changes include replay and old/new consumer compatibility tests before downstream use.

## Edge Cases

- Job is acked before durable DB write.
- Validation accepts unknown fields.
- Error response leaks internal details.
- Worker crashes mid-job.
- Outbox dispatcher publishes event twice.
- Consumer processes event and crashes before checkpoint.
- Command is retried with same idempotency key but different payload.
- Unknown API enum value reaches mobile generated client.
- Domain error is mapped differently by two controllers.
- API returns success before outbox event is durable.
- Worker lease expires while a provider call is still running.
- Retry happens after the source binding or topic has been disabled.
- Health endpoint reports green while broker publish path is broken.
- Trace context is lost between REST command and worker job.
- OpenAPI diff is safe but mobile mapper lacks unknown enum fallback.
- Event schema adds optional field but consumer assumes it is required.
- Problem Details code changes meaning without mobile/support update.
- Generated client changes method shape and feature store imports raw DTO to save time.

## Pay Attention

- Controllers call use cases only.
- Use cases depend on ports.
- Workers must be idempotent from day one.
- Ack after durable checkpoint, not before.
- Error contracts should expose recovery state without leaking internals.
- Do not put business decisions inside exception filters, guards or broker consumers.
- Keep adapters replaceable: fake broker/fake repository tests should exercise use cases without Nest runtime.
- Contract artifacts are release inputs; if generation is flaky, downstream work is not stable.
- Compatibility checks must run before mobile/realtime teams consume the change.

## Acceptance Criteria

- API can create demo tenant/topic.
- Worker consumes a no-op job idempotently.
- Error contract is consistent.
- Trace/correlation id appears in logs.
- Duplicate command returns stable result or typed conflict according to idempotency contract.
- Outbox dispatch and inbox dedupe are testable with fake broker.
- Problem Details examples exist for validation, authorization, quota, source failure and internal failure.
- Fake-source vertical slice runs through API command -> outbox/job -> worker -> read model.
- Worker shutdown test proves no ack before durable checkpoint.
- Health/readiness distinguishes liveness, dependency degraded and startup-not-ready states.
- OpenAPI diff, generated client regeneration and event schema compatibility checks are repeatable.
- Contract artifact examples exist for REST, Problem Details and event/job payloads.
