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

## Independent review risk register — explicitly not repaired by this refactor

ReviewRouter's incomplete transport result (0/57 reviewed) is **not** a review. CodeRabbit's substantive review raised existing cross-boundary problems not safely solvable by extraction-only edits. These are confirmed against the current interfaces and adapters, **not** approvals or silent suppressions. GitHub issue creation returned **HTTP 410: Issues has been disabled in this repository**, so this document and the linked review threads are the durable tracking location until the issue tracker is enabled.

1. **Conditional rollback and event atomicity (Major)** — [CodeRabbit thread](https://github.com/777genius/social-monitor/pull/622#discussion_r4475630636): `revertAcceptedTopicBindingUpdate` reads/checks the binding config, then invokes unconditional `sourceBindings.save`; Prisma uses upsert without compare-and-swap. A concurrent binding edit can be overwritten. Saving the binding and appending the revert event also occur in separate operations. Follow-up scope: tenant/workspace-scoped persisted CAS, explicit `config_changed` on failed compare, atomic event append, PostgreSQL concurrent-writer and crash E2E. A speculative in-memory check or unchecked retry is **not** a fix.
2. **Pending-outbox scheduler admission (Major)** — [CodeRabbit thread](https://github.com/777genius/social-monitor/pull/622#discussion_r4475630644): scheduler `scanQueue.canAccept` does not include pending durable `ingestion.scan.execute` outbox commands committed by `PrismaScanDispatchAdapter`. A paused/slow relay can accumulate unbounded durable handoffs despite apparent broker capacity. Follow-up scope: atomic/race-safe pending-outbox capacity signal and scheduler backoff, with PostgreSQL 18 + RabbitMQ pause/resume, multi-scheduler and tenant isolation E2E. Preserve existing Serializable scan-job + outbox commit.
3. **Bounded database-redelivery budget (Major)** — [CodeRabbit thread](https://github.com/777genius/social-monitor/pull/622#discussion_r4475972387): repeated transient Prisma `P2034` leads to `basic.nack(requeue=true)` with no durable per-message attempt ceiling; RabbitMQ delivery limits do not provide the expected protection for explicit nack loops. Follow-up scope: existing durable delayed-retry handoff, bounded persisted attempts, backoff/escalation, crash/restart and real RabbitMQ starvation E2E. Do not turn a transient serialization failure into immediate permanent loss.

These follow-ups affect platform-wide persistence/relay/retry contracts and are **out of scope** for the single ingestion extraction PR. They must remain visible for subsequent dedicated work, and this Draft PR must not be interpreted as fixing them. The additional CodeRabbit stale cross-binding retry concern **is still an in-scope correctness review item** until independently qualified or fixed.


## Other verified independent-review follow-ups (separate change control)

The [CodeRabbit review on `bb47017`](https://github.com/777genius/social-monitor/pull/622) contained 20 inline comments and 24 follow-ups. Localized provider identity/completeness, health timestamp, null/Unicode parsing, ranking and pagination defects were addressed with focused regression tests. The following **are not claimed fixed** and need targeted follow-up work:

- **Accepted-topic apply/outbox/idempotency atomicity (Major):** `sourceBindings.save`, `outbox.append` and `idempotency.set` can commit in different operations. A failed append can lose the undo token on replay. A coherent unit-of-work or recoverable saga, tenant-scoped concurrent-writer tests and crash E2E are required in the topic-application bounded context. This is separate from the CAS/revert defect above.
- **Live-source beta evidence (Major/Minor):** Telegram's external-beta requirement has no producer for `SOURCE_TELEGRAM_LIVE_EVIDENCE_PATH`; Reddit's app-only OAuth blocker is not measured by an app-only evidence signal. Keep both `fixture_ready` (not `live_beta_ready`) until their external-evidence runner and certification policy produce/verify the required artifacts.
- **Partial provider backoff:** Partial page success retains incomplete collection evidence, but the scheduler lacks a durable rate-limit reset signal for a successful scan with a later retryable page failure. Requires persistence/admission contract and quota E2E.
- **RSS compatibility:** The HTTP limit precedes final projection eligibility, so invalid entries can consume the limit and advance conditional-fetch identity past valid entries. Namespace-prefixed Atom elements also require namespace-aware mapping and XHTML regression tests. Preserve warning evidence and XML entity safeguards.
- **Outcome replay and concurrency:** A persisted successful scan replay can report success without the original collection telemetry; cursor updates under independent scan-job leases lack a per-binding compare-and-swap fence. Require durable attempt metadata/transaction contracts, multi-worker replay and cursor-monotonicity E2E.
- **Monitoring 24h coverage:** Source-binding health reads at most 50 jobs but presents a nominal 24h window; explicitly expose truncation or fetch the full bounded interval.
- **Nonhistorical Hacker News comments:** Recent comments under older roots may be lost by root-age filtering and final max-item caps. Preserve root context, comment time, priority and bounded completeness with fixtures.

These are traceable follow-ups, **not** marked-resolved findings or relaxed gates. GitHub Issues are disabled in this repository (HTTP 410); the plan and linked review threads are the durable open record until an issue tracker is available.
