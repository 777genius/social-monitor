# Ingestion scan foundation refactor (2026-11-05)

Status: **Draft / implementation follows**. Base: `31b11fa64ffae6c1b38ac519890077c2192167b9`.

## Observed debt

- `libs/ingestion/features/execute-scan/execute-scan.use-case.ts` coordinates command validation, lease ownership, idempotency, source fetch, candidate screening, persistence/enrichment, feed/conversation/engagement projections, cursors, memory, retry/dead-letter and reporting. Changing provider processing currently risks retry semantics.
- `apps/ingestion-worker/src/scan-queue-drain-loop.ts` combines RabbitMQ settlement mechanics with scan error/disposition policy. That policy determines whether a delivery is acknowledged, requeued or dead-lettered.
- Ingestion is already a DDD bounded context with domain/feature/port/adapter/interface separation and focused executable contracts. **No new framework, generic pipeline engine, cross-context shared abstraction or rewrite of the domain model is justified.**

## Refactor boundaries

1. Extract the scan **collection/projection workflow** into one application-layer coordinator depending only on existing ports, domain and injected clock/IDs. Keep the precise order: cursor read → fetch → sanitization/screening → persist → feed → conversation → metadata → engagement → cursor commit → candidate-memory bookkeeping. No transport, Nest, Prisma, env or provider SDK imports.
2. Keep `ExecuteScanUseCase` as the public application entrypoint that owns validation, lease, attempt idempotency, failure recording, result/reporting and failure metadata. Do not change constructor/API signatures or existing retry thresholds.
3. Extract worker **delivery settlement decision** to a pure, named policy in the worker package. The queue drain loop still owns ack/nack, lease-renewal cleanup, metrics and lifecycle; the policy cannot call infrastructure.
4. Add targeted regression coverage for ordering, persisted attempt replay, terminal/retry dispositions and queue settlement, reusing existing fakes rather than building a second test framework.

## Invariants / acceptance

- Worker never acknowledges `scan_lease_held`, backpressure, lease-release failure or outcome-reporting failure as terminal.
- Already-recorded scan failures are acknowledged so a broker redelivery does not create duplicate retries.
- A failed projection must not advance the cursor; a successful attempt is saved **before** reporting; an outcome-reporter failure must remain recoverable by replay.
- Workspace/tenant scope, redaction, provider-specific projection timing, candidate memory and all persisted metadata remain byte-for-byte/semantically compatible.
- No database migration, OpenAPI change, release/deployment workflows, runtime mode changes or production actions.
- No weakened architecture checks; preserve under-1000 LOC source/test limits.
- Required checks: TypeScript typecheck, architecture, code-quality, line cap, focused ingestion specs, worker retry/settlement specs, and relevant PR CI (including E2E when available).

## Review checkpoints

- Review A: Clean Architecture/SOLID/DDD layering, proliferation of types/helpers, and over-engineering.
- Review B: adversarial durability review (lost/duplicated retry, ordering, cursor/lease, partial side effects, redaction, error handling).
- Review C: changed-file verification and PR CI results at the exact head.
- Only necessary changes make it through review. Keep the PR Draft until checked. **Lines changed are not a success metric**; this refactor is intentionally scoped to the platform's highest-risk scan path rather than inflating the diff with unrelated churn.
