# Cross-Iteration Dependency Map

## Purpose

This document defines how the MVP moves through iterations without losing Clean Architecture, DDD, SOLID, ports/adapters, event-driven boundaries, NestJS microservice readiness and future Flutter Feature-scoped Clean Architecture.

It is the dependency map for planning sprints and deciding what can run in parallel.

## Critical Path

```text
00-foundation
-> 01-platform-skeleton
-> 02-ingestion-connectors
-> 03-ai-summary-intelligence
-> 05-realtime-delivery
-> 06-production-hardening
-> 07-beta-mvp-launch
```

`04-mobile-app` is currently a deferred future track. It can resume after the backend/API-first loop is stable; it is not a blocker for backend MVP execution.

The strict path is not because teams cannot parallelize. It is because the contracts and domain invariants must be stable before downstream work depends on them.

## Risk-First Dependency Rule

Before starting a downstream iteration, check the highest-risk dependency it consumes:

1. Iteration 01 consumes foundation context, source policy and contract rules.
2. Iteration 02 consumes tenant-safe persistence, outbox/idempotency and stable platform contracts.
3. Iteration 03 consumes normalized feed provenance and stable source item identity.
4. Deferred Iteration 04 consumes generated OpenAPI, feed contract and summary/citation contract when frontend work resumes.
5. Iteration 05 consumes versioned status/event contracts and REST resync behavior.
6. Iteration 06 consumes all user-visible failure states and operational signal points.
7. Iteration 07 consumes beta safety evidence, support runbooks and frozen source scope.

If the consumed dependency is `Yellow`, downstream work may plan and prototype with fake adapters only. If it is `Red`, downstream implementation is blocked.

## Stop Gates

### Gate 00 - Foundation Complete

Must be true before production code:

1. Bounded contexts are named.
2. Aggregate ownership is documented.
3. Source acquisition policy is documented.
4. REST/event/gRPC versioning rules are documented.
5. Layer dependency rules are documented.

Blocks:

- Platform skeleton module boundaries.
- Source connector SDK.
- Future Flutter feature layout.

Tenant-specific evidence:

1. Tenant/workspace ownership terms are defined.
2. Core aggregates state whether they are global, tenant-owned or workspace-owned.
3. Event examples include tenant/workspace scope where needed.

### Gate 01 - Platform Skeleton Complete

Must be true before real ingestion:

1. Backend monorepo builds.
2. Local infrastructure boots.
3. Core migrations run.
4. OpenAPI generation works.
5. Outbox/idempotency foundation exists.
6. Architecture boundary tests exist.

Blocks:

- Scheduler implementation.
- Feed persistence.
- Generated API client.
- Event consumers.

Tenant-specific evidence:

1. Tenant context propagation exists for REST and workers.
2. Repository signatures require tenant/workspace scope for tenant-owned data.
3. Duplicate command tests include tenant boundary cases.

### Gate 02 - Ingestion Complete

Must be true before summarization:

1. Connector SDK exists.
2. HN/RSS adapters pass certification tests.
3. Scheduler runs idempotently.
4. Normalized feed items are persisted.
5. Dedupe works across provider ID, canonical URL and content hash.
6. Source provenance is preserved.

Blocks:

- Evidence-based summaries.
- Feed UI.
- Realtime feed status.

### Gate 03 - Summarization Complete

Must be true before summary UX:

1. Summary policy aggregate exists.
2. AI provider is behind a port.
3. Output schema validation works.
4. Citations map to source items.
5. Cost/token tracking exists.
6. Eval harness exists.

Blocks:

- Future summary frontend screen.
- Summary notifications.
- Beta quality review.

### Gate 04 - Deferred Frontend Complete

This gate is deferred while the MVP is backend/API-first. If frontend work is reactivated, it must be true before frontend-dependent beta readiness:

1. App can create topic.
2. App can configure source binding and scan policy.
3. App can show feed.
4. App can show cited summary.
5. MobX stores are feature-scoped.
6. Generated REST client does not leak DTOs into domain.
7. Empty/error/stale/offline states are handled.

Blocks only when frontend is active:

- Beta onboarding.
- User feedback loop.

### Gate 05 - Realtime Delivery Complete

Must be true before beta operations:

1. WebSocket auth works.
2. Reconnect/resync works.
3. Notifications are idempotent.
4. Digest preferences exist.
5. Delivery logs exist for webhooks/API-key future path.

Blocks:

- Launch support workflow.
- Status-driven user experience.

### Gate 06 - Production Hardening Complete

Must be true before beta launch:

1. Tenant isolation tests pass.
2. Secrets are encrypted and redacted.
3. Observability dashboards exist.
4. Queue lag and provider failures are visible.
5. CI blocks unsafe migrations and contract breaks.
6. Cost and quota limits are enforced.
7. Backup/restore is verified.

Blocks:

- External beta users.

Tenant-specific evidence:

1. Cross-tenant negative tests cover API, repositories, jobs and event consumers.
2. Provider credentials are encrypted and redacted.
3. Quotas are enforced before provider/AI calls.
4. Support/admin access creates audit events.

### Gate 07 - Beta Launch Complete

Must be true before expanding sources:

1. MVP scope is frozen.
2. Support runbook exists.
3. Known limitations are documented.
4. Feedback metrics are wired.
5. Source expansion decisions are evidence-based.

Blocks:

- Adding high-risk/expensive social sources.
- Multi-user scale expansion.

## Parallel Work Lanes

## Lane A - Backend Domain And Contracts

Can start:

- After Gate 00.

Owns:

1. Domain entities and value objects.
2. Use cases.
3. Ports.
4. REST DTOs.
5. Event schemas.
6. gRPC internal contracts.

Must not:

- Import NestJS into domain.
- Import ORM models into use cases.
- Expose provider raw payloads through public contracts.

## Lane B - Infrastructure And Messaging

Can start:

- During Iteration 01 after monorepo skeleton exists.

Owns:

1. PostgreSQL.
2. Kafka.
3. RabbitMQ.
4. Outbox.
5. Worker runtime.
6. Observability primitives.

Must not:

- Decide business rules.
- Hide failed jobs without surfacing status.
- Create unbounded retries.

## Lane C - Source Connectors

Can start:

- After connector SDK types are approved.

Owns:

1. HN adapter.
2. RSS adapter.
3. Provider certification tests.
4. Provider capability profiles.
5. Source health warnings.

Must not:

- Add production browser automation for restricted platforms.
- Mix provider-specific fields into normalized feed core.
- Save cursor before durable item write.

## Lane D - AI Summarization

Can start:

- After normalized feed and evidence model exist.

Owns:

1. Summary policy.
2. AI provider port.
3. Prompt templates.
4. Structured output validation.
5. Evals.
6. Cost controls.

Must not:

- Generate uncited summaries as final user-visible output.
- Let prompt templates own domain rules.
- Ignore token/cost telemetry.

## Lane E - Flutter App

Can start:

- Shell can start after Gate 00.
- Real feature integration starts after OpenAPI contracts from Gate 01.
- Feed/summary screens require Gates 02 and 03.

Owns:

1. Feature-scoped Clean Architecture.
2. MobX presentation stores.
3. Generated REST client adapters.
4. Headless UI component integration.
5. Empty/error/stale/offline states.

Must not:

- Put business invariants in widgets.
- Let generated DTOs become domain entities.
- Import infrastructure from another feature directly.

## Lane F - Operations And Launch

Can start:

- During Iteration 06, with support docs drafted earlier.

Owns:

1. Runbooks.
2. Dashboards.
3. Alerts.
4. Support workflow.
5. Beta checklist.
6. Feedback loop.

Must not:

- Launch without tenant isolation tests.
- Launch without provider failure visibility.
- Launch without cost/quota limits.

## Dependency Rules

1. A UI screen cannot be considered complete until its backend contract is generated and tested.
2. A summary cannot be considered complete unless it has source evidence links.
3. A connector cannot be considered complete unless certification tests cover rate limit, malformed payload and duplicate scan behavior.
4. A scan job cannot be considered complete unless retry, dead-letter and idempotency behavior is defined.
5. An event cannot be considered complete unless schema versioning and replay behavior are documented.
6. A microservice boundary cannot be split physically until the bounded context and contract are stable.
7. A source cannot move to beta unless capability profile, legal/ToS constraints and fallback behavior are documented.
8. A release cannot proceed if OpenAPI diff breaks the active generated API client or active frontend.
9. A failure state cannot move downstream unless it has API code, API/frontend recovery action, support signal and fixture coverage.
10. A quota-sensitive workflow cannot move downstream unless usage ledger and preflight checks exist before provider/AI calls.
11. A contract-changing slice cannot move downstream unless compatibility evidence exists for REST/events/DB/generated client/provider profile/AI schema as applicable.

## Cross-Cutting Blocker Matrix

These blockers apply across all iterations, even when the local phase file does not mention them.

| Blocker | Blocks Iterations | Required Fix |
| --- | --- | --- |
| Missing tenant/workspace scope in command/query/job/event | all downstream work | add typed scope and negative test |
| Unsupported source path used as implementation dependency | ingestion, AI, frontend, beta | move to readiness profile or approved provider path |
| Provider raw DTO crosses adapter boundary | feed, summary, frontend/API client | normalize and add import/mapper tests |
| Cursor can advance before item persistence | ingestion, feed, summary | fix transaction/checkpoint order and crash tests |
| Summary can complete without valid citations | AI, frontend, delivery, beta | block completion and add eval fixture |
| WS event needed for correctness | frontend, realtime, beta | REST/read model resync path required |
| External cost occurs before quota check | ingestion, AI, delivery, hardening | enforce preflight and usage ledger |
| Support cannot diagnose common failure safely | hardening, launch | dashboard/runbook/support-safe DTO required |
| Contract change lacks generated client/event compatibility evidence | platform, frontend, realtime | update contract tests and compatibility notes |
| Contract compatibility matrix is missing or bypassed | platform, ingestion, AI, frontend, realtime, hardening | classify contract family, consumers, breaking risk and evidence |
| Data retention/deletion/replay behavior is unclear | platform, ingestion, AI, hardening, launch | define lifecycle policy, retention owner and fixtures |
| Queued/in-flight work has unclear state re-check behavior | ingestion, AI, delivery, frontend, hardening | define state consistency matrix and race fixtures |
| Time/window semantics are unclear | ingestion, AI, realtime, delivery, frontend, hardening | define temporal semantics and fake-clock/window-boundary fixtures |

When one of these appears, mark the active gate `Red`; planning may continue with fake adapters only, but implementation that depends on the blocker must stop.

## Evidence Packet Per Gate

Every gate promotion should include a small evidence packet:

1. contract versions changed or confirmed unchanged
2. tenant-scope proof
3. idempotency/retry proof where relevant
4. source/AI/provider policy proof where relevant
5. generated-client/frontend compatibility proof where relevant
6. observability/support proof where relevant
7. data lifecycle proof where relevant: retention, delete/export, replay/backfill
8. state race proof where relevant: queued/in-flight re-checks and cancellation/suppression
9. temporal proof where relevant: fake-clock, timezone, DST, window-boundary and clock-skew fixtures
10. contract compatibility proof where relevant: OpenAPI diff, event replay, migration, generated client, provider profile or AI schema evidence
11. accepted exceptions with owner and revisit date

The packet can be a compact markdown entry in the active iteration evidence register; it does not need a heavy formal process.

## Data Lifecycle Dependency Rule

Before a downstream iteration depends on stored data, the upstream owner must define the lifecycle behavior:

1. Platform defines table ownership, retention class and migration compatibility.
2. Ingestion defines raw payload, normalized item, cursor and backfill retention behavior.
3. Summary defines what happens when cited source items are deleted, hidden or raw body is no longer retained.
4. Mobile defines stale/unavailable citation behavior and offline cache invalidation.
5. Realtime/delivery defines operational delivery-attempt retention and replay safety.
6. Hardening defines export/delete runbook, retention exceptions and audit trail.
7. Beta launch explains known limitations to users/support.

If lifecycle behavior is unclear, the downstream feature may use fake fixtures but cannot ship user-visible behavior.

## State Race Dependency Rule

Before a downstream iteration depends on background work, the upstream owner must define re-check behavior for state changes:

1. Scheduler/ingestion defines topic/source disabled, policy changed, credential revoked and quota exhausted behavior.
2. Summary defines stale/superseded evidence and regenerate/idempotency behavior.
3. Mobile defines late response, workspace switch and stale event behavior.
4. Realtime/delivery defines preference changed, endpoint quarantined and membership revoked behavior.
5. Hardening defines deploy/migration pause/drain behavior.

If this behavior is unclear, work may run in tests with deterministic fake states only; it cannot enter beta user flows.

## Temporal Dependency Rule

Before a downstream iteration depends on scheduled or windowed data, upstream must define clock and boundary behavior:

1. Platform provides injected clock, UTC storage and timestamp conventions.
2. Ingestion defines scan interval, provider cursor, observed/published time and backfill boundaries.
3. Summary defines evidence window, stale marker and regeneration timing.
4. Mobile defines localized display, stale labels and offline freshness.
5. Realtime/delivery defines replay, digest, webhook timestamp and delivery windows.
6. Hardening defines retention job timing and SLO measurement windows.

If temporal behavior is unclear, downstream work may use deterministic fake time fixtures but cannot ship scheduled/windowed beta behavior.

## Service Boundary Dependency Rule

Before any context is split into a physical service, the iteration owner must prove the split is useful and safe.

Required proof:

1. Stable bounded context ownership and aggregate/data ownership.
2. Stable REST/event/gRPC contract with consumer tests.
3. Independent scaling, latency, reliability or security reason.
4. Failure-mode mapping: timeout, unavailable service, duplicate event, stale read model and partial deploy.
5. Observability and rollback evidence: traces, metrics, logs, DLQ/runbook and schema compatibility.
6. MVP impact statement: which beta user value or operational safety improves.

Blocked splits:

- Extracting a service because the architecture diagram looks cleaner.
- Extracting before REST/read-model fallback exists for realtime paths.
- Extracting while domain events or DTOs are still changing rapidly.
- Extracting if it forces duplicate tenant/auth/quota checks without a shared tested policy.
- Extracting if the team cannot operate the extra runtime during beta.

If this proof is missing, build a module/lib boundary with ports, import rules and contract tests instead.

## Broker And RPC Responsibility Rules

Kafka is the durable event backbone:

1. Domain/integration events.
2. Replayable state changes.
3. Fan-out to multiple consumers.
4. Audit-friendly event history.

RabbitMQ is for command/job dispatch when it is chosen:

1. Work queues with explicit ack/retry/dead-letter behavior.
2. Worker jobs that need bounded attempts and operational triage.
3. Command-like tasks where replaying an event stream is not the goal.

gRPC is for internal synchronous calls only when:

1. Request/response latency matters.
2. The call is service-to-service, not mobile-facing.
3. Contracts are generated and versioned.
4. REST or event flow would create worse coupling or latency.

Do not route the same responsibility through multiple transports without an ADR. If a behavior can be modeled as a durable event, prefer Kafka. If it is a bounded worker command, consider RabbitMQ. If it is synchronous internal lookup/command with strong latency need, consider gRPC.

## Vertical Slice Dependency Rule

Prefer vertical slices over horizontal completion. A slice is valid only when it includes:

1. Domain/use-case change or explicit reason no domain change is needed.
2. Port/adapter boundary.
3. Contract or schema impact.
4. Tenant-scope behavior.
5. At least one test fixture.
6. User/operator-visible state or evidence.

Horizontal work such as "set up all brokers", "build all UI shell", "write all prompts" or "add all adapters" is allowed only when it directly unblocks a named vertical slice.

## Complexity Control Gate

Before adding any new capability, classify it:

1. `Core MVP`: required for the end-to-end beta loop.
2. `Safety MVP`: required to protect tenant data, source credentials, cost, reliability or support visibility.
3. `Extension Contract`: not needed now, but a port/contract prevents future rewrite.
4. `Deferred`: useful later, but not needed before beta evidence.

Rules:

- `Core MVP` and `Safety MVP` must have implementation tickets and acceptance evidence.
- `Extension Contract` must stop at interface, ADR, capability profile or placeholder adapter.
- `Deferred` must not consume sprint implementation capacity.
- Any item promoted from `Deferred` needs demand evidence, risk review and owner.

## Contract Freeze Points

These freeze points prevent downstream churn:

1. After Gate 00, bounded context names, aggregate ownership and source policy require change control.
2. After Gate 01, REST resource names, event envelope shape, tenant propagation and migration conventions require compatibility review.
3. After Gate 02, normalized item identity, provenance fields and scan lifecycle states require migration and replay review.
4. After Gate 03, summary output schema, citation model and feedback taxonomy require eval rerun and mobile compatibility review.
5. After Gate 04, mobile feature boundaries and generated-client adapters require architecture review before cross-feature reuse.
6. After Gate 05, WebSocket event names, reconnect semantics and notification idempotency keys require versioning.
7. After Gate 06, beta scope, quotas, support runbook and known limitations require launch approval to change.

Changing a frozen contract is allowed only when the change includes owner, consumer impact, migration path, test evidence and rollback/mitigation.

## Contract Compatibility Dependency Rule

Before a downstream iteration consumes a changed contract, the upstream owner must provide compatibility evidence.

Required per contract family:

1. REST/OpenAPI: generated artifact, diff classification, generated Flutter client and mapper/store tests.
2. Events/jobs: schema version, replay behavior, idempotency key behavior and old/new consumer compatibility.
3. Database: clean migration, upgraded migration, deploy compatibility and rollback/mitigation note.
4. Provider capability profile: profile version, existing binding snapshot behavior and source-specific fixture.
5. AI summary schema: schema validation, eval rerun, citation contract and mobile render compatibility.
6. Problem Details: stable code, safe detail fields and mobile recovery/support mapping.

If compatibility evidence is missing, the next iteration may use a fake fixture but cannot treat the contract as stable.

## Evidence Handoff Rule

Every gate handoff must include:

1. The artifact created.
2. The contract affected.
3. The tests that prove it.
4. The metrics/logs/dashboards that expose failure.
5. The residual risk and owner.
6. The next iteration that consumes it.

If any of these are missing, the next iteration may plan around the work but must not depend on it as complete.

## MVP Sequencing By Sprint

### Sprint 01 - Foundation And Skeleton

1. Finish Iteration 00.
2. Start Iteration 01 monorepo and local infrastructure.
3. Create first OpenAPI skeleton.
4. Add architecture tests.

Exit:

- Topic can be created through REST.

### Sprint 02 - Ingestion Core

1. Build connector SDK.
2. Implement HN adapter.
3. Implement RSS adapter.
4. Build scheduler and worker lease.
5. Persist normalized feed.

Exit:

- Scheduled HN/RSS scans produce deduped topic feed.

### Sprint 03 - Summary Core

1. Build summary policy.
2. Build AI provider port.
3. Add cited structured summaries.
4. Add eval harness.
5. Add summary REST endpoints.

Exit:

- Topic has latest cited summary from ingested feed.

### Sprint 04 - Deferred Frontend Track

This sprint is not required for the backend/API-first MVP.

1. Preserve Flutter/FSD architecture docs.
2. Keep generated REST client strategy compatible.
3. Resume only after backend contracts and API loop are stable.
4. Build topic/source/feed/summary features later if user-facing app becomes active scope.

Exit:

- Frontend can complete the full loop only when explicitly resumed.

### Sprint 05 - Realtime And Notifications

1. Add WebSocket status.
2. Add reconnect/resync.
3. Add in-app notifications.
4. Add digest foundation.

Exit:

- User sees scan and summary status without manual refresh.

### Sprint 06 - Hardening

1. Add tenant isolation tests.
2. Add observability.
3. Add contract diff checks.
4. Add migration checks.
5. Add cost/quota limits.

Exit:

- Platform is beta-operable.

### Sprint 07 - Beta Launch

1. Freeze MVP.
2. Prepare onboarding.
3. Run full E2E and failure scenarios.
4. Launch limited beta.
5. Collect feedback.

Exit:

- Decisions for next source expansion are evidence-based.

## Highest-Risk Dependencies

1. Source access reliability: solve with provider capability profiles, official/open/provider adapters and source-specific fallback behavior.
2. Multi-tenant data isolation: solve with tenant-scoped repositories, tests and audit logs.
3. Summary factuality: solve with cited evidence, schema validation and evals.
4. Queue/job duplication: solve with idempotency keys, worker leases and cursor discipline.
5. Mobile/backend contract drift: solve with OpenAPI generation and contract diff checks.
6. Cost spikes: solve with scan budgets, AI budgets, quotas and metrics.
7. Premature microservice split: solve with bounded contexts first, deploy split only when contracts are stable.

## Definition Of Powerful MVP

The MVP is powerful only when this is true:

1. It works end to end for a real user.
2. It is multi-tenant by architecture, even if beta usage is small.
3. Source connectors are replaceable.
4. Summaries are cited and auditable.
5. Failures are visible to users and operators.
6. Mobile UX covers real operational states.
7. The next source can be added through adapter work, not platform rewrite.
