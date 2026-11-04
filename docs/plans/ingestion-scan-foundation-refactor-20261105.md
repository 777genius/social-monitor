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


## Expanded foundation scope (2026-11-05, requested large-scale refactor)

The first implementation is intentionally limited and CI-proven. The project owner
requires substantially more work in **the same Draft PR** before review/merge.
Preserve earlier guards and add staged, independently-verifiable changes:

1. **Source-provider readiness boundary:** split the monolithic catalog into
   provider-family collections while keeping the runtime readiness overlay and
   stable public export contract. New providers should not require editing a
   400+ line mixed-source manifest.
2. **Source acquisition / normalization:** isolate provider-specific external
   DTO normalization, pagination/window/cursor decisions and HTTP transport,
   keeping provider-specific identities and authorization rules intact. Prefer
   existing domain and adapter contracts; no generic orchestration framework.
3. **Monitoring scheduler / health:** separate scheduling policy, job/queue
   dispatch and read-model presentation from high-level use cases. Preserve
   cross-process idempotency, workspace/tenant isolation, limits, status codes
   and provider-backoff behavior.
4. **Persistence and retention:** remove mixed durable adapter responsibilities
   only when a direct mapping to a reviewed inner contract already exists.
   Keep Serializable transactions, write retry, fencing and provenance semantics.
5. **Testing and gate hardening:** coverage for every moved boundary (behavioral
   parity, repeated delivery, failed persistence, cursor consistency,
   redaction, provider quota/rate limits); run strict static/broker/PostgreSQL
   and full PR checks on the exact final HEAD.

## Scope discipline for large diff

- Aim at approximately 10–15k **meaningful** added/deleted lines across
  impacted modules and regression tests, without padding with formatting
  churn, generated artifacts, cosmetic renames or unrelated folders.
- The repository's own 1k-LOC per source/test file hard limit applies; move
  cohesive responsibilities instead of creating giant files.
- API/DB migration, release/deploy logic, summary editorial PR #617,
  Nomad PR #391 and X manifest PR #597 remain out of scope.
- Every staged implementation commit is pushed to the Draft branch and checked
  for type/API compatibility. Break a subphase apart rather than weaken tests.
- **No merge, no production deployment** until the final exact-HEAD CI is green
  and unresolved high-severity review findings are addressed. Automated review
  that is rate-limited or unavailable is not an approval.
