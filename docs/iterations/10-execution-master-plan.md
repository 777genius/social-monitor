# Execution Master Plan

## Purpose

This is the top-level execution plan for building the powerful MVP. It converts the iteration folders into a practical delivery sequence: what to build first, who owns which lane, what artifacts must exist, what tests block progress and what risks require attention.

Use this file before opening individual iteration folders.

## MVP Delivery Target

The backend/API-first MVP is complete when a beta evaluator or operator can:

1. Create or join a workspace.
2. Create a topic.
3. Bind an allowed source.
4. Configure scan interval and summary rules.
5. Let the system scan on schedule.
6. Read deduplicated feed items with provenance through REST/OpenAPI or generated client.
7. Read cited AI summaries through REST/OpenAPI or generated client.
8. Observe realtime scan/summary status through WebSocket harness or status API.
9. Provide summary feedback.
10. Operate safely inside tenant quotas and source limits.

Flutter/mobile is deferred. A user-facing frontend can be added after the backend loop, contracts, source adapters, summary pipeline and beta safety gates are proven.

## Non-Negotiable Architecture Rules

1. Domain has no NestJS, ORM, broker, OpenAPI DTO or Flutter dependency.
2. Use cases depend on ports.
3. Adapters implement ports and translate external payloads.
4. REST/OpenAPI is the app-facing backend contract.
5. Events are versioned, tenant-scoped and idempotency-aware.
6. gRPC is only for internal service-to-service calls where it earns its complexity.
7. Kafka is used for durable event streams.
8. RabbitMQ may be used for job/command dispatch where retry queues and worker semantics are simpler.
9. If Flutter is resumed, it follows feature-scoped Clean Architecture with MobX presentation stores.
10. Source ingestion uses official/open/provider adapters; unsafe production scraping is rejected.

## Multi-Tenant Invariants

These rules apply even during personal-use MVP development:

1. Every workspace-owned aggregate has tenant/workspace ownership in domain and persistence.
2. Every command/query carries tenant context explicitly.
3. Every repository method that reads tenant data requires tenant/workspace scope by signature.
4. Every event envelope includes tenant/workspace scope when it references tenant-owned data.
5. Every worker job includes tenant/workspace scope, correlation id, idempotency key and retry budget.
6. Every provider credential is tenant/workspace-owned, encrypted at rest and redacted in logs/traces/errors.
7. Every scan, summary and delivery attempt writes usage/cost telemetry before beta.
8. Every support/admin access path emits audit events separate from debug logs.
9. Quotas are enforced before external provider calls or AI calls, not only after cost is incurred.
10. Cross-tenant negative tests are required for API, repository, worker and event-consumer paths.

Do not create "single user" shortcuts that would require later data model rewrites.

## Microservice Evolution Rule

Start as a modular NestJS monorepo with explicit service/module boundaries. Extract a physical microservice only when there is evidence that the boundary needs independent deployment or scaling.

Physical extraction requires:

1. Stable bounded context ownership.
2. Stable REST/event/gRPC contracts.
3. Independent scaling or reliability need.
4. Separate data ownership or clear integration pattern.
5. Observability for requests, events, jobs and failures.
6. Contract tests for all consumers.
7. Rollback plan if the extracted service fails.

Default MVP stance:

- `api-gateway`, workers and realtime can be separate apps in the monorepo.
- Bounded contexts can be modules/libs before they become separately deployed services.
- Kafka carries durable domain/integration events.
- RabbitMQ carries command/job style work when queue semantics, retries and dead-letter routing are clearer than Kafka.
- gRPC is introduced only for internal synchronous calls that are proven by latency/consistency needs and cannot be handled through REST or events.

Do not split a service because the diagram looks cleaner. Split only when the runtime evidence makes the tradeoff worth the operational cost.

## Good MVP Complexity Budget

The MVP must be powerful, but not enterprise-heavy. Build the core loop deeply and keep expansion surfaces thin.

| Area | Build Fully In MVP | Keep As Port/Contract | Defer Until Evidence |
| --- | --- | --- | --- |
| Backend architecture | Clean domain/use cases, ports, adapters, tenant-safe REST/OpenAPI | gRPC proto ownership and service extraction criteria | Physical split of every bounded context |
| Messaging | Outbox, idempotency, scan jobs, durable status/events | Kafka/RabbitMQ responsibility boundaries | Complex event choreography and saga framework |
| Sources | Fake, HN, RSS with certification and capability profiles | Reddit/X/Telegram readiness profiles | Broad social source expansion |
| AI summaries | Cited structured summaries, evals, cost telemetry | Provider fallback interface | Multi-agent research, fine-tuning, complex personalization |
| Frontend | API/operator beta through OpenAPI/generated client; no full app required | Flutter/FSD contracts and generated client strategy | Full user-facing Flutter app, rich analytics, marketing pages |
| Realtime | Scan/summary status, reconnect/resync | Webhooks/API keys as future-ready ports | Marketplace-style integrations |
| Operations | Tenant isolation, redaction, quotas, basic dashboards/runbooks | Compliance evidence structure | Enterprise certifications, multi-region, full billing suite |

Use this decision rule:

1. If it is required for the loop to work safely, build it.
2. If it protects future extensibility but is not needed at runtime yet, define a port, contract or ADR.
3. If it optimizes scale, polish or enterprise operations before beta usage proves need, defer it.
4. If a feature cannot produce user-visible value, operational safety or rewrite-risk reduction within the MVP, do not build it yet.

## Service Boundary Readiness Matrix

Use this matrix before turning a bounded context into a physically deployed microservice. The MVP should be microservice-ready, not microservice-fragmented.

| Boundary | MVP Shape | Extract Only When | Do Not Extract If |
| --- | --- | --- | --- |
| API Gateway | separate NestJS app in monorepo | public REST/OpenAPI needs independent scaling or deploy cadence | it only forwards calls to one local module |
| Scheduler/Workers | separate worker app in monorepo | scan/summary/delivery jobs need independent replicas, queue tuning or failure isolation | job volume is still tiny and contracts are unstable |
| Realtime Gateway | separate app is acceptable | WS fanout/backpressure needs separate runtime controls | REST/read model resync is not implemented yet |
| Identity/Tenancy | module/lib first | auth/session domain stabilizes and multiple apps consume it through contracts | only one app consumes it and extraction would duplicate auth checks |
| Source/Ingestion | module plus worker adapters first | provider rate limits, credential isolation or scan volume require separate deployment | source capability profiles are still changing weekly |
| Feed/Summary | module first, workers for heavy jobs | summary cost/latency requires independent queue scaling | citation/evidence contracts are not stable |
| Delivery/Webhooks | module/worker first | webhook/customer integrations need isolated retry/DLQ/SLOs | notifications are still MVP digest/status only |
| Billing/Usage | module first | paid plans, audit retention or finance operations require stronger isolation | quota logic can be enforced through a narrow port |

Extraction checklist:

1. The domain model and public contracts are stable for at least one full iteration.
2. The extracted service has a clear data ownership boundary or read-model contract.
3. All callers have contract tests and failure fallbacks.
4. Observability, DLQ/runbook, deploy rollback and schema compatibility are ready.
5. Extraction reduces a measured scaling/reliability risk, not just diagram complexity.

MVP rule: if extraction is not justified by this checklist, keep the context as a module/lib with strict import boundaries, ports and contract tests.

## MVP Domain Model Minimum

Build only the aggregates needed to protect the beta loop. Do not create broad generic social-network abstractions before real source behavior proves them.

| Aggregate | Context | Owns In MVP | Must Not Own |
| --- | --- | --- | --- |
| `Workspace` | Identity/Tenancy | tenant boundary, membership, role, workspace settings | source provider credentials, feed items, summaries |
| `Topic` | Topic Management | monitoring intent, user-visible name, query/rule references, enabled state | provider cursors, raw source payloads, AI output |
| `SourceBinding` | Source Management | selected source, capability profile snapshot, source query/config, credential reference, health state | scan execution history, deduplicated feed records |
| `ScanPolicy` | Scheduling | interval, freshness target, retry budget, quota preflight policy | provider-specific HTTP behavior, AI summarization rules |
| `ScanJob` | Scheduling/Ingestion | job lifecycle, lease, cursor checkpoint intent, failure class | topic rule editing, final feed mutation rules |
| `SourceItem` | Ingestion | normalized provider item identity, provenance, observed metadata, raw-payload pointer if retained | user summary text, delivery status |
| `FeedItem` | Feed | dedupe identity, topic/source linkage, visibility state, item-level status | provider credentials, source-specific cursor logic |
| `SummaryArtifact` | Summary | cited summary, schema version, model/prompt version, quality status, user feedback link | source acquisition, notification sending |
| `DeliveryAttempt` | Delivery | realtime/digest/webhook attempt state, idempotency key, failure class | summary generation, feed dedupe |
| `UsageRecord` | Billing/Usage | scan/AI/delivery cost and quota evidence | business decisions about topic relevance |

Minimum invariants:

1. A tenant-owned aggregate cannot be created, loaded or mutated without tenant/workspace scope.
2. `SourceBinding` cannot be enabled without a certified capability profile and allowed acquisition mode.
3. `ScanJob` cannot advance a durable cursor before observed items are safely persisted or the failure mode is recorded.
4. `FeedItem` identity is derived from canonical provider identity plus source/topic context, not from mutable display text.
5. `SummaryArtifact` cannot become final unless every claim is tied to source item evidence or explicitly marked as unsupported/excluded.
6. `DeliveryAttempt` is always idempotent by tenant, channel, artifact/status id and recipient target.
7. `UsageRecord` is written before or atomically with externally costly operations where the system can control execution.

MVP cutline:

- Build aggregates above with focused value objects and use cases.
- Keep advanced taxonomies, semantic clustering, billing plans, admin impersonation and complex team governance as extension points.
- Do not add a generic `SocialPost` or `ProviderAccount` aggregate that becomes a dumping ground for source-specific behavior.
- Treat Reddit, X/Twitter and Telegram as readiness profiles until an approved API/vendor path is selected.

## Backend Feature-Sliced Clean Architecture

Use DDD bounded contexts as the top-level backend boundary, then organize application behavior inside each context as feature/use-case slices.

Target shape:

```text
contexts/
  topic-management/
    domain/
      aggregates/
      value-objects/
      events/
      policies/
    features/
      create-topic/
        create-topic.command.ts
        create-topic.result.ts
        create-topic.use-case.ts
        create-topic.use-case.spec.ts
      disable-topic/
      list-topics/
    ports/
      topic.repository.port.ts
      domain-event-publisher.port.ts
    adapters/
      persistence/
    interfaces/
      rest/
      events/
```

Rules:

1. A bounded context is the future microservice boundary.
2. `domain` contains shared business model for the context; it is not duplicated per feature.
3. `features/*` contain application/use-case slices: command/query, result, use case and use-case tests.
4. `ports` are context-level contracts required by features.
5. `adapters` implement ports and may use Prisma, providers, queues, AI SDKs or external clients.
6. `interfaces` map REST/jobs/events/WS into feature use cases.
7. A feature must not import Prisma, Nest controllers, Kafka/RabbitMQ clients or provider SDKs directly.
8. A controller/job handler must not contain business decisions; it calls a feature use case.

This gives the backend the readability of Feature-Sliced Design while preserving DDD, Clean Architecture and service extraction boundaries.

## MVP Test Strategy

Use a practical test pyramid. The goal is not maximum test volume; the goal is fast proof that the MVP loop is safe, repeatable and hard to accidentally break.

Build these tests deeply:

1. Domain unit tests for aggregates, value objects, policies and invariants.
2. Use-case tests with fake ports for topic/source binding, scan scheduling, feed, summary and delivery flows.
3. Contract tests for REST/OpenAPI, event envelopes, connector capability profiles and generated API clients.
4. Adapter certification tests for source providers and AI providers.
5. Idempotency/retry tests for commands, scan jobs, summary jobs, notifications and webhooks.
6. Tenant isolation negative tests for API, repositories, workers and event consumers.
7. Generated client/API harness tests for generated DTO boundaries and visible failure states.
8. One or two end-to-end smoke tests for the complete backend/API beta loop.

Keep these lightweight in MVP:

- Full browser/device matrix.
- Large load-test suites beyond the capacity envelope.
- Expensive chaos engineering.
- Exhaustive visual regression beyond core states.
- End-to-end tests for every edge case when lower-level tests prove the behavior faster.

Blocking evidence before beta:

1. Architecture import tests pass.
2. OpenAPI generation and compatibility checks pass.
3. Migrations run from clean and upgraded states.
4. Connector certification passes for fake/HN/RSS.
5. Summary eval gate passes for schema, citations, prompt-injection and cost regression.
6. API/generated-client harness covers loading-equivalent, success, empty, error, stale and degraded states.
7. Tenant isolation and redaction tests pass.
8. Full loop smoke test passes from generated client or API harness.
9. Beta capacity envelope and degradation behavior are documented and tested.

## Lightweight Decision Policy

Use ADRs only for decisions that can cause rewrite, contract drift, source risk or beta-scope confusion. Do not create ADRs for routine implementation details.

Requires ADR:

1. Bounded context or aggregate ownership changes.
2. Source acquisition category or new source readiness decision.
3. REST/event/gRPC contract versioning or compatibility rule change.
4. Database ownership, migration policy, outbox/idempotency behavior change.
5. AI provider/model/prompt policy that affects quality, cost or citations.
6. Frontend feature boundary, generated-client strategy or design-system dependency change when frontend work is active.
7. Physical service extraction, broker responsibility or gRPC introduction.
8. Beta scope, supported source list, quota policy or launch gate change.

Enough as change note:

- Copy changes.
- Non-contract UI polish.
- Test fixture additions.
- Internal refactor that does not change ports, contracts, schema, events or user-visible states.
- Documentation clarification that does not change a decision.

Every ADR should include: decision, alternatives, rationale, consequences, owner, evidence, rollback/mitigation and revisit trigger.

## MVP Completion Criteria

The MVP is ready for controlled beta when all are true:

1. A user can complete workspace -> topic -> source binding -> scheduled scan -> feed -> cited summary -> feedback.
2. HN/RSS/fake source paths are reliable enough to prove the connector platform.
3. New sources are handled through readiness profiles, not active implementation.
4. Summaries are structured, cited, evaluated and cost-tracked.
5. API/operator workflow exposes core success and failure states without developer intervention.
6. Realtime status improves freshness but REST/read models remain source of truth.
7. Tenant isolation, secret redaction and quota checks pass.
8. Support can diagnose common beta failures without shell/database access.
9. Known limitations are explicit and visible to beta users/support.
10. Post-MVP backlog is prioritized by beta evidence, risk and cost.
11. Capacity envelope is explicit: beta tenant count, topics, scan intervals, summaries, queue lag and cost ceilings.

## Beta Capacity And Degradation Matrix

The MVP must state the safe beta envelope before launch. These limits are product and operations controls, not arbitrary technical guesses.

| Pressure | MVP Guardrail | User/System Behavior | Evidence |
| --- | --- | --- | --- |
| Too many tenants for beta ring | invite rings and tenant cap | hold next ring; do not silently degrade all users | ring decision log |
| Too many topics/source bindings | per-tenant/topic limits | reject or warn with clear recovery action | quota/validation test |
| Scan interval too aggressive | platform minimum plus provider minimum | reject config or suggest safer interval | scan policy test |
| Scan queue backlog | queue lag SLO and per-tenant fairness | show degraded freshness; pause noisy tenant before starving others | backlog/fairness drill |
| Provider rate pressure | source capability budgets and circuit breaker | source degraded; reduce frequency or pause binding | provider outage/rate-limit drill |
| AI cost/token pressure | summary input budget and quota preflight | no-cost rejection before provider call; user sees quota recovery | adapter spy/usage ledger test |
| Summary backlog | summary window budget and stale marker | show queued/stale state; do not block feed correctness | fake-clock backlog fixture |
| WS/realtime pressure | REST snapshot remains truth | event may be delayed; client resyncs through REST | missed event/resync test |
| DB hot query pressure | tenant-scoped indexes and read-model pagination | degrade filters/export before core feed/detail | EXPLAIN/load evidence |
| Delivery retry storm | channel retry budget and DLQ | suppress/quarantine endpoint; scans/summaries remain prioritized | delivery retry drill |

Rules:

1. Capacity envelope changes require owner, evidence and beta-ring decision.
2. Load shedding is acceptable only if it preserves tenant isolation, data integrity, cursor safety and user-visible status.
3. Worker scaling must not increase provider/API pressure beyond source capability budgets.
4. A noisy tenant must be throttled before it consumes shared provider, worker or AI budget.
5. If the envelope is exceeded during beta, the default action is hold ring expansion, reduce limits or pause non-core work; do not add premature infrastructure complexity first.

Always blockers:

- Cross-tenant data exposure.
- Secret or credential leakage.
- Unsupported source path entering production.
- Final user-visible uncited summary.
- Cursor/idempotency bug that can duplicate or lose feed data.
- API/generated-client workflow cannot complete the core loop.
- Support cannot identify source/scan/summary failure class.

Acceptable MVP gaps:

- Limited source list.
- Small but representative eval dataset.
- Basic dashboards instead of mature SRE platform.
- Modular monorepo before physical microservice split.
- Webhooks/API keys as future-ready contract rather than beta-critical feature.
- Limited visual polish if core states are clear and usable.

## Master Risk Register

Work risk-first. These risks can invalidate the MVP if ignored:

| Risk | Early Signal | First Mitigation | Stop Condition |
| --- | --- | --- | --- |
| Tenant isolation leak | Query/job/event lacks tenant/workspace scope | Add type/signature guard and negative test | Any reproducible cross-tenant access |
| Source access instability | Adapter cannot state acquisition mode, limits or cursor behavior | Require readiness profile and certification | Unsupported source enters production path |
| Lost or duplicated feed data | Cursor advances before durable write or retry behavior is unclear | Enforce outbox/idempotency and cursor crash tests | Scan can lose or duplicate durable feed state |
| Provider payload leakage | Feed/summary/mobile needs provider-specific fields | Fix normalized model and mapper boundary | Provider DTO leaks past adapter |
| Untrusted AI output | Summary can pass without citations or schema validation | Add claim-level citation and eval gate | Final uncited summary is user-visible |
| Cost runaway | Scan/summary runs before quota preflight | Enforce tenant/topic/source budgets | Provider/AI call can bypass quota |
| Mobile contract drift | Generated DTO appears in domain/store | Add mapper/store tests and generated-client check | Core flow breaks after API change |
| Realtime inconsistency | WS event required for correctness or no resync path | Keep REST read model as truth and add resync | Missed event cannot be recovered |
| Support blindness | Failure visible to user but not dashboard/runbook | Add safe metric and support classification | Support needs shell/database access |
| Scope creep | New source/integration/polish blocks core loop | Classify as Core, Safety, Extension or Deferred | Beta scope changes without evidence/owner |
| Capacity envelope unknown | No beta limits for tenants/interests/scans/AI/queues | Define envelope, quotas, SLOs and degradation behavior | Cannot decide safe ring expansion |

When a stop condition appears, pause dependent work and fix the risk before adding features.

## Critical MVP Gap Audit

Run this audit before starting implementation, before each gate promotion and before beta invite. It catches the gaps that most often survive otherwise good architecture documents.

| Critical Gap | Where It Usually Hides | Required MVP Control | Evidence Before Beta |
| --- | --- | --- | --- |
| Tenant scope lost in async work | worker jobs, event consumers, replay scripts | tenant/workspace required in job/event envelope and validated before side effects | malformed job/event fails closed |
| Cursor/idempotency data loss | scan retry, provider cursor update, outbox dispatch | cursor commit after durable item write, idempotency keys for command/job/event/delivery | crash-before/after-persist tests |
| Source access overpromise | onboarding, source catalog, sales/support copy | readiness profiles and visible limitations | unsupported source renders unavailable, not broken |
| Provider DTO leakage | feed model, mobile mapper, summary evidence | adapter anti-corruption mappers and boundary tests | provider DTO cannot compile/import downstream |
| AI unsupported claims | summary validation, repair/fallback path | schema validation plus claim-to-citation validation | eval fixture blocks uncited final output |
| Cost incurred before quota | scheduler, summary retry, delivery retry | quota preflight before provider/AI call and usage ledger | adapter call spy proves no call after over-quota |
| Realtime becomes source of truth | mobile store, WS gateway, notification status | WS is hint, REST/read model is truth | missed-event test recovers through REST snapshot |
| Support needs raw data | dashboard, runbook, incident triage | support-safe DTOs, redaction, correlation ids | support drill completes without DB/shell/raw payloads |
| Contract drift reaches mobile | OpenAPI generation, event schema, enum changes | generated-client diff and unknown-value fallback | CI blocks drift or mapper tests cover fallback |
| Beta scope creep | launch pressure, source requests, integrations | controlled rings, scope freeze and change rule | go/hold/rework decision has evidence |
| Data lifecycle ambiguity | raw payloads, summaries, citations, deletion/export, replay | data lifecycle matrix and source retention policy | deletion/export/replay fixtures prove behavior |
| State race ambiguity | disabled topics, revoked membership, queued jobs, in-flight summaries, delivery retries | state consistency matrix and re-check points | queued/in-flight race fixtures prove behavior |
| Temporal semantics ambiguity | scan intervals, cursors, summary windows, digest windows, stale markers | temporal semantics matrix and fake-clock fixtures | DST/clock-skew/window-boundary tests prove behavior |
| Capacity/degradation ambiguity | beta rings, quotas, queue backlog, provider pressure, AI cost, noisy tenants | capacity envelope and degradation matrix | load/backpressure/fairness drills prove behavior |
| Contract compatibility ambiguity | REST, events, DB migrations, generated clients, provider profiles, AI schema | compatibility matrix and consumer-impact review | OpenAPI/event/migration/generated-client/eval evidence |

If any row is `Red`, dependent work stops. If a row is `Yellow`, the owner, mitigation and deadline must be recorded in the active iteration evidence register.

## Contract Compatibility Gate

Every implementation slice must classify contract impact before code is merged.

| Contract Family | Gate Question | Blocking Evidence |
| --- | --- | --- |
| REST/OpenAPI | Can current and generated mobile clients consume it safely? | OpenAPI diff plus mapper/store tests |
| Events/jobs | Can old and new consumers process/replay without duplicate or lost side effects? | schema compatibility plus replay/idempotency test |
| DB schema | Can API/workers run during deploy and rollback window? | clean/upgrade migration and compatibility plan |
| Provider capability profile | Do existing bindings keep correct cursor/rate-limit semantics? | snapshot migration or pause/re-check fixture |
| AI summary schema | Can old summaries and new summaries render/evaluate safely? | schema validation, eval rerun and mobile mapper test |
| Problem Details | Does every user-visible code map to recovery/support behavior? | API fixture and mobile recovery mapping |

Rules:

1. Breaking changes require ADR or formal exception with owner, consumer impact, migration and rollback/mitigation.
2. Optional fields are allowed only when consumers ignore unknown fields or map them safely.
3. New enum/status/error values require unknown-value fallback tests before release.
4. No downstream iteration may depend on a contract that lacks generated artifact, compatibility evidence and owner.
5. Contract compatibility evidence belongs in the active iteration evidence register.

## Failure Propagation Matrix

Every failure must have a consistent path from backend to mobile/support. Do not add a failure class unless it maps across this matrix.

| Failure Class | Backend Source | User State | Support Signal | Recovery Action |
| --- | --- | --- | --- | --- |
| `source_unavailable` | connector/provider error | source degraded/unavailable | provider failure class, binding id, correlation id | view limitation, retry later, disable binding |
| `quota_exceeded` | quota preflight | blocked by quota | usage ledger rejection | reduce interval, wait, upgrade/manual review |
| `scan_failed_retryable` | worker/provider transient failure | scan retrying/degraded | job attempt, retry count, DLQ risk | wait, view status |
| `scan_failed_terminal` | invalid source config or unsupported capability | action required | source health failure class | edit config, reconnect source |
| `summary_failed_validation` | schema/citation/business validation | summary failed/review required | eval/failure class and artifact id | regenerate after fix, contact support |
| `summary_no_signal` | evidence selection | no-signal summary | source window and selection reason | refine topic/source |
| `delivery_failed` | notification/webhook adapter | delivery failed/pending | delivery attempt state | retry, update channel |
| `auth_or_access_changed` | auth/session/membership | re-auth or no access | audit/security event | re-authenticate, request access |
| `stale_data` | new evidence after snapshot/artifact | stale marker | freshness timestamp/version | refresh/regenerate |

Each row requires: stable Problem Details code where API-visible, mobile recovery mapping, support-safe diagnostic fields and at least one test fixture.

## Data Lifecycle Matrix

The MVP must know what data it stores, why it stores it and how it behaves when source data changes, users request deletion or replay/backfill is needed.

| Data | Store In MVP | Retention Default | Delete/Export Behavior | Critical Notes |
| --- | --- | --- | --- | --- |
| Provider credentials | encrypted secret store/reference | until binding/account disconnect | delete/rotate credential; audit action | never log, never expose to mobile/support |
| Source catalog/capability profile | DB/config registry | versioned indefinitely | export not user data | old bindings keep capability snapshot until migration |
| Scan job/attempt | DB operational table | bounded operational retention | export only status if user-relevant | contains tenant/workspace/correlation/idempotency |
| Cursor/checkpoint | DB, versioned payload | while binding active plus recovery window | delete on binding deletion unless audit exception | commit only after durable item persistence |
| Raw provider payload | object storage pointer only when approved | shortest practical period by source policy | delete or detach on request/policy | not required for domain correctness; never default support view |
| Normalized source item | DB | product retention window | export if tenant-owned; delete/hide by policy | keeps provenance and provider identity |
| Feed item/read model | DB | product retention window | delete/hide with topic/workspace deletion | dedupe identity remains tenant-scoped |
| Summary artifact | DB | product retention window | export; delete or tombstone per policy | citations may outlive raw body through safe provenance |
| Summary feedback | DB | product/eval retention | export/delete unless anonymized eval fixture | never mutates original artifact |
| Delivery attempt | DB operational table | bounded operational retention | export status if user-relevant | provider acceptance is not user read receipt |
| Usage record | append-only ledger | billing/audit retention | export aggregate/user-relevant records | corrections are new records, not silent edits |
| Audit event | append-only security record | security retention | limited export; deletion may be restricted | payloads must be redacted |

MVP rules:

1. Raw payload retention is opt-in by source/capability policy, not automatic.
2. Summary citations must survive raw body deletion by retaining safe provenance and normalized fields where policy allows.
3. Deleting a topic/source binding stops new work, cancels or finishes queued work by policy and hides/deletes read models consistently.
4. Replaying events or jobs must re-check tenant access, source policy and current binding/topic state before side effects.
5. Export/delete can be manual in MVP, but the workflow, owner, retention exceptions and audit trail must be documented.
6. Backfill is bounded by source capability, tenant quota and retention policy; unrestricted historical backfill is deferred.

## State Consistency Matrix

The MVP must define how long-running work reacts when user or system state changes while work is queued or in flight.

| State Change | Affected Work | Required Re-Check Point | MVP Behavior |
| --- | --- | --- | --- |
| Workspace membership revoked | API, WS, jobs, support views | before read/write, before worker side effect, before WS fanout | fail closed, disconnect/block messages, audit event |
| Topic disabled | scheduled scans, summaries, digests, feed status | before enqueue, after lease claim, before summary/digest assembly | stop new work; queued work cancels or completes only by explicit policy |
| Source binding disabled | scan jobs, source health, delivery | before provider call and before item persistence | no provider call; mark job cancelled or terminal with user-visible state |
| Scan policy changed | queued scan jobs | after job claim before execution | use job snapshot or cancel/requeue according to policy; never silently mix policies |
| Capability profile changed | source bindings and scheduler | before scheduling and before provider call | existing bindings use snapshot until explicit migration or pause |
| Tenant quota exhausted | scan/summary/delivery retries | before external call and before retry | reject or pause before cost; record usage ledger rejection |
| Source credential rotated/revoked | provider calls | before provider call | use current credential state; fail with reconnect-source action |
| Feed item hidden/deleted | summary generation and citation display | before summary completion and citation expansion | exclude from new summaries; existing citations show unavailable/stale policy |
| Summary superseded/stale | mobile, delivery, feedback | before delivery and feedback write | show stale/superseded; feedback attaches to original artifact |
| Notification preference changed | queued delivery | before send | suppress/cancel if disabled |
| Webhook endpoint quarantined | delivery retry | before retry | cancel/suppress retry and show delivery status |
| Deploy/migration in progress | workers and schedulers | startup/readiness and before schema-dependent write | drain/pause or use compatible schema path |

Rules:

1. Long-running jobs carry a snapshot for audit, but re-check current authority/state before side effects.
2. A state change must produce user/support-visible status when it cancels or suppresses work.
3. Re-check points belong in use cases/workers/adapters, not only UI guards.
4. If a job uses snapshot semantics, the snapshot fields and compatibility rules must be explicit.
5. Race fixtures are required for topic disable, source disable, membership revoke, quota exhaustion and delivery preference change.

## Temporal Semantics Matrix

Every time-based behavior must say which clock it uses, how windows are calculated and what happens at boundaries.

| Behavior | Time Source | Boundary Rule | MVP Test Evidence |
| --- | --- | --- | --- |
| Stored timestamps | server clock, UTC `timestamptz` | store UTC, display localized only in UI | DB/mapping test |
| Scan interval | scheduler server clock plus source/provider limits | next run computed from last accepted/finished attempt by policy | fake-clock interval test |
| Manual scan throttle | server clock | idempotency/throttle window per tenant/source binding | duplicate manual scan test |
| Provider cursor | provider cursor/time semantics | opaque/versioned; do not assume provider clock equals system clock | fixture with skew/reordered items |
| Backfill window | source capability and tenant quota | bounded inclusive/exclusive policy documented per provider | backfill boundary test |
| Source item observed time | system observed time plus provider published time when available | keep both; never use provider time alone for durability decisions | reordered/future timestamp fixture |
| Feed pagination cursor | server/read-model ordering | stable `(observed_at, feed_item_id)` or equivalent | pagination while new items arrive |
| Summary evidence window | frozen server-side selection window | inclusive/exclusive bounds recorded with window hash | boundary item included/excluded test |
| Stale summary marker | comparison of summary source window to newer feed evidence | newer accepted evidence marks stale; text is not mutated | stale marker fixture |
| Digest window | tenant/user preference plus UTC schedule anchor | deterministic window id and content hash | duplicate digest/window boundary test |
| WS replay window | realtime service replay retention | cursor too old returns `resync_required` | expired cursor test |
| Webhook signature timestamp | sender server clock | receiver tolerance window documented | replay/timestamp skew test |
| Retention job | server clock, UTC | retention uses tombstone/created/updated policy per table | retention boundary test |

Temporal rules:

1. Domain/application code uses an injected `Clock`; tests use fake clock.
2. Store UTC; localize only in presentation/mobile copy.
3. Provider timestamps are evidence, not scheduling authority.
4. Window boundaries must be explicit: inclusive start, exclusive end unless a contract says otherwise.
5. Every cursor/window/digest id must be stable under retry.
6. DST and user timezone must not change scan execution semantics; they may change displayed digest preference times only by documented rule.

## Team Lanes

## Lane 1 - Backend Domain And API

Owns:

1. Bounded contexts.
2. Aggregates and value objects.
3. Use cases.
4. REST controllers.
5. OpenAPI.
6. Repository ports.
7. Event contracts.

Quality bar:

- Unit tests for domain rules.
- Contract tests for REST.
- Architecture import tests.
- Tenant-scope tests for every query.

## Lane 2 - Ingestion And Messaging

Owns:

1. Connector SDK.
2. Provider adapters.
3. Scheduler.
4. Worker leases.
5. Retry/backoff.
6. Cursor discipline.
7. Dedupe pipeline.
8. Kafka/RabbitMQ integration.

Quality bar:

- Connector certification tests.
- Idempotent repeated scans.
- Dead-letter visibility.
- Provider failure classification.

## Lane 3 - AI And Summaries

Owns:

1. Summary policy.
2. Evidence model.
3. AI provider port.
4. Prompt templates.
5. Structured output validation.
6. Evals.
7. Cost and token tracking.

Quality bar:

- Every summary has citations.
- Invalid structured output is rejected.
- Prompt/model changes run evals.
- Cost spikes are visible.

## Lane 4 - Deferred Frontend

Owns:

1. Future Flutter/FSD app shell when frontend is reactivated.
2. Generated REST client adapter strategy.
3. Future MobX store rules.
4. Future topic/source/feed/summary screens.
5. Future `flutter_headless` design-system integration.
6. Future offline/stale/error states.

Quality bar:

- Deferred frontend does not block backend/API-first MVP.
- Generated API clients remain infrastructure and do not shape backend domain.
- When resumed, DTOs do not leak into feature domain/stores.
- When resumed, app can complete the API-proven loop.

## Lane 5 - Ops, Security And Release

Owns:

1. CI/CD.
2. Migrations.
3. Observability.
4. Secrets.
5. Tenant isolation.
6. Runbooks.
7. Beta launch controls.

Quality bar:

- CI blocks breaking contracts.
- Logs redact secrets.
- Dashboards explain scan and summary health.
- Rollback path exists.

## Sprint Plan

## MVP Vertical Slice Build Order

Build the MVP as thin vertical slices. Each slice must leave the system more runnable than before.

1. Repository and architecture test skeleton: prove domain cannot import framework, ORM, broker, provider or generated DTO code.
2. Tenant/workspace context: create tenant-scoped request context, persistence convention and test fixture.
3. Topic creation API: domain model, use case, repository port, Postgres adapter, REST endpoint and OpenAPI output.
4. Source catalog API: expose approved MVP sources with capability profiles, not hard-coded UI strings.
5. Source binding API: bind topic to source with scan policy, validation and tenant ownership checks.
6. Outbox/idempotency path: duplicate command does not duplicate topic/source binding and event publication is transactional.
7. Fake source provider: run connector certification without external network dependency.
8. HN provider adapter: ingest real HN items through `SourceProviderPort` and normalize into feed items.
9. RSS/Atom provider adapter: prove the connector SDK works for a second source shape.
10. Scheduler and worker lease: run scans by policy with retry, backoff, dead-letter and cursor safety.
11. Feed read model: dedupe by provider ID, canonical URL and content hash while preserving provenance.
12. Summary policy API: configure rules without coupling them to a specific AI provider or prompt.
13. Evidence selection: choose feed items for summary with citation targets and tenant/topic boundaries.
14. AI summarizer adapter: call provider through a port and reject invalid structured output.
15. Summary read API: return cited, persisted summaries with status and failure states.
16. API/generated-client harness: prove topic -> source binding -> scan status -> feed -> summary -> feedback without a full frontend.
17. WebSocket status harness: add scan and summary progress with reconnect/resync.
18. Hardening and beta gate: tenant isolation, redaction, quotas, dashboards, rollback and API/operator onboarding.
19. Deferred frontend: resume Flutter/FSD or another frontend only after backend contracts and loop are stable.

Do not start broad source expansion, frontend buildout, visual polish, complex notification channels or physical microservice splitting until this sequence works end to end.

## Daily Execution Loop

Use this loop during implementation days:

1. Pick one vertical slice from the active iteration.
2. Confirm the slice is `Core MVP`, `Safety MVP` or `Extension Contract`.
3. Open the iteration's `<iteration>/35-first-sprint-ticket-cut.md`, `<iteration>/45-definition-of-ready-for-tickets.md` and `<iteration>/47-implementation-command-checklist.md`.
4. Write the PR goal in one sentence: user/system outcome, bounded context, layer, contract impact and evidence.
5. Implement in this order: domain/contract, use case, port, adapter, integration, tests, observability, docs.
6. Stop if a boundary violation, missing tenant scope, unclear idempotency or unsupported source path appears.
7. Close the day only after evidence is attached or the blocker is recorded with owner and next action.

Good MVP PR size:

- One bounded context or one vertical workflow.
- One contract family unless the change is explicitly a cross-contract slice.
- One primary risk reduced.
- One clear rollback/mitigation path if persistence, jobs, source access, AI or release behavior changes.

Split the PR if it mixes unrelated UI polish, source expansion, infrastructure changes and domain rules.

## Sprint 0 - Alignment And Foundation

Primary iteration:

- `00-foundation`

Deliverables:

1. Product loop and glossary.
2. Bounded context map.
3. Aggregate ownership table.
4. Source acquisition policy.
5. Architecture guardrails.
6. Contract versioning rules.
7. Ticket quality rule.

Do not start:

- Connector implementation.
- AI prompts.
- Mobile feature screens.
- Physical microservice split beyond skeleton.

Edge cases:

- Scope pressure to support every social network immediately.
- Confusion between topic rules and summary rules.
- Treating browser automation as production connector strategy.

Exit gate:

- Every future ticket can name context, layer, port/adapter and contract impact.

## Sprint 1 - Platform Skeleton

Primary iteration:

- `01-platform-skeleton`

Deliverables:

1. NestJS monorepo skeleton.
2. Backend apps and shared libs.
3. Local PostgreSQL, Kafka and optional RabbitMQ.
4. Core migrations.
5. Outbox and idempotency foundation.
6. Minimal REST flow for workspace/topic/source binding.
7. OpenAPI generation.
8. Architecture tests.

Can run in parallel:

- Flutter shell planning.
- Observability baseline planning.
- Connector SDK type draft.

Do not start:

- Real scheduled ingestion until idempotency/outbox exists.
- Mobile integration until OpenAPI is generated.

Edge cases:

- Shared libs become unstructured common code.
- Tenant ID is not carried through internal calls.
- Events publish outside transaction boundary.

Exit gate:

- A topic can be created through REST and persisted with tenant scope.

## Sprint 2 - Ingestion Core

Primary iteration:

- `02-ingestion-connectors`

Deliverables:

1. `SourceProviderPort`.
2. Capability profile model.
3. Provider registry.
4. HN adapter.
5. RSS adapter.
6. Scheduler and scan jobs.
7. Worker lease.
8. Retry/backoff/dead-letter behavior.
9. Normalized item persistence.
10. Feed dedupe read model.

Can run in parallel:

- Flutter generated client setup.
- Summary policy draft.
- Realtime event naming draft.

Do not start:

- Evidence-based AI summaries until feed provenance exists.
- Source expansion beyond HN/RSS until adapter certification is stable.

Edge cases:

- Cursor saved before durable item write.
- Same URL appears across multiple sources.
- Provider returns malformed or partial payload.
- Tenant deletes topic while scan job is queued.

Exit gate:

- Scheduled HN/RSS scans produce tenant-scoped, deduped feed items.

## Sprint 3 - AI Summary Intelligence

Primary iteration:

- `03-ai-summary-intelligence`

Deliverables:

1. Summary policy aggregate.
2. Summary request/job lifecycle.
3. Evidence model.
4. AI provider port.
5. Structured output schema.
6. Prompt template registry.
7. Cost/token telemetry.
8. Eval harness.
9. Summary REST endpoints.
10. Feedback endpoint.

Can run in parallel:

- Feed UI.
- Summary UI skeleton.
- Notification event planning.

Do not start:

- User-visible final summary without citations.
- Notification digest copy until summary states are stable.

Edge cases:

- Provider returns malformed JSON.
- Summary claim lacks evidence.
- Topic rules change while summary job is running.
- Feed exceeds context window.

Exit gate:

- Latest topic summary is cited, persisted, auditable and retrievable through REST.

## Sprint 4 - Deferred Frontend Track

Primary iteration:

- `04-mobile-app`

Deliverables:

1. Preserve Flutter/FSD architecture as the preferred future app path.
2. Keep generated REST client strategy compatible with future Flutter adapters.
3. Keep frontend DTO/domain/store guardrails documented.
4. Keep topic/source/feed/summary UX requirements traceable to REST/OpenAPI.
5. Do not implement full frontend until backend/API loop, contracts, source adapters, summary pipeline and beta safety gates are proven.

Can run in parallel:

- WebSocket gateway implementation.
- Production hardening preparation.
- Beta onboarding draft.

Do not start:

- Full Flutter/frontend buildout before the backend/API-first loop works.
- Polishing secondary UI before API/operator beta evidence exists.
- Adding unsupported source configuration screens to a future frontend backlog without source readiness.

Edge cases:

- Generated DTOs leak into domain.
- Store contains domain invariants.
- Summary exists but cited item is unavailable.
- API harness feed is empty because scan has not run.

Exit gate:

- Frontend remains deferred with clear contracts; backend/API harness can complete topic -> source -> scan -> feed -> summary -> feedback.

## Sprint 5 - Realtime And Delivery

Primary iteration:

- `05-realtime-delivery`

Deliverables:

1. WebSocket gateway.
2. Channel authorization.
3. Scan/feed/summary realtime events.
4. Reconnect/resync behavior.
5. In-app notification read model.
6. Digest foundation.
7. Webhook/API-key future ports.
8. Delivery logs.

Can run in parallel:

- Security hardening.
- CI/CD hardening.
- Support runbook drafting.

Do not start:

- External integrations as beta-critical path.
- Complex notification channels before in-app status is reliable.

Edge cases:

- User loses access while connected.
- Event arrives twice.
- Mobile reconnect misses updates.
- Notification queued after preference changed.

Exit gate:

- User sees scan and summary progress without manual refresh.

## Sprint 6 - Production Hardening

Primary iteration:

- `06-production-hardening`

Deliverables:

1. Tenant isolation tests.
2. Provider credential encryption.
3. Secret redaction.
4. Metrics and dashboards.
5. Alert rules.
6. CI contract diff checks.
7. Migration checks.
8. Load/cost tests.
9. Quotas.
10. Backup/restore verification.

Can run in parallel:

- Beta scope freeze.
- Onboarding materials.
- Demo topic preparation.

Do not start:

- External beta with real users.
- Adding expensive or high-risk social sources.

Edge cases:

- One tenant causes queue backlog for all tenants.
- Provider outage creates retry storm.
- AI cost spikes after prompt change.
- Logs contain sensitive provider payloads.

Exit gate:

- The platform can be operated by support without developer shell access.

## Sprint 7 - Beta Launch

Primary iteration:

- `07-beta-mvp-launch`

Deliverables:

1. Scope freeze.
2. Known limitations.
3. Beta onboarding.
4. Support workflow.
5. Launch checklist.
6. Incident runbook.
7. Feedback taxonomy.
8. Source expansion decision process.

Do not start:

- Broad public launch.
- More source adapters unless beta evidence supports priority.

Edge cases:

- Users ask for X/Twitter before production-safe adapter is approved.
- Summary quality issue is caused by vague topic configuration.
- Provider quota is exhausted during onboarding.
- Generated API client/backend versions drift.

Exit gate:

- Beta produces evidence for next source and product priorities.

## Acceptance Matrix

| Area | MVP Acceptance |
| --- | --- |
| Domain | Bounded contexts, aggregates and invariants are documented and tested. |
| API | REST/OpenAPI supports workspace, topic, source binding, feed and summary. |
| Events | Scan/feed/summary/delivery events are versioned and idempotent. |
| Ingestion | HN/RSS scan repeatedly without duplicate feed items. |
| AI | Summaries are structured, cited, evaluated and cost-tracked. |
| Frontend | Deferred; API/generated-client harness completes the loop and Flutter/FSD remains a future track. |
| Realtime | Scan and summary status update without manual refresh. |
| Security | Tenant isolation and secret redaction are tested. |
| Ops | Dashboards, alerts, runbooks and rollback path exist. |
| Launch | Beta scope, limitations and feedback loop are explicit. |

## Implementation Order Inside Each Ticket

Use this order unless the ticket file says otherwise:

1. Domain model or contract.
2. Use case.
3. Port.
4. Adapter.
5. Persistence/message/API integration.
6. Tests.
7. Observability.
8. Documentation update.

## Ticket Conversion Rules

Convert iteration documents into implementation tickets with this strict order:

1. Take the phase from `<iteration>/21-phase-to-ticket-map.md`.
2. Choose the smallest vertical slice that can produce testable evidence.
3. Add the bounded context and layer explicitly.
4. Link the affected contract: REST, event, gRPC, database schema, mobile generated client or provider capability profile.
5. Add one happy-path test and at least one negative/edge-case test.
6. Add observability evidence if the ticket changes jobs, queues, provider calls, AI calls, auth or delivery.
7. Add rollback or mitigation if the ticket changes persistence, migrations, source access, summary behavior or launch scope.

Reject a ticket before implementation if it cannot name its contract impact, tenant-scope behavior, idempotency behavior where relevant and acceptance evidence.

## Global Stop-Work Rules

Stop the current slice and resolve the issue before continuing if any of these appear:

1. Domain code imports NestJS, ORM, broker, OpenAPI DTOs, generated Flutter DTOs or provider raw payloads.
2. A provider cursor can advance before normalized items are durably stored.
3. A summary can become user-visible without citations or structured output validation.
4. A REST/OpenAPI change breaks generated mobile clients without versioning or migration plan.
5. A job can retry indefinitely without budget, backoff, dead-letter path and operator visibility.
6. A tenant-scoped query can run without tenant constraint or authorization proof.
7. A launch or beta workflow depends on unsupported source acquisition.
8. A migration changes production data shape without rollback, backfill or compatibility plan.
9. A failure can be observed by a user but has no support-safe diagnostic path.
10. A quota, source policy or AI permission check happens after the external cost/risk is already incurred.

## Common Mistakes To Avoid

1. Building source-specific logic into topic or feed domain.
2. Treating microservices as a goal before contracts stabilize.
3. Letting generated DTOs become frontend domain models.
4. Saving provider cursors before item persistence succeeds.
5. Creating summaries without citations.
6. Hiding failed scans from users.
7. Adding social sources through fragile automation instead of provider strategy.
8. Shipping beta without tenant isolation tests.
9. Treating WebSocket events as durable state.
10. Letting support workflows depend on raw database or provider payload access.

## Final MVP Readiness Checklist

1. Full loop works from mobile.
2. Source failures are visible.
3. Summary failures are visible.
4. Duplicate scans do not duplicate feed.
5. Tenant data does not leak.
6. Cost limits protect the system.
7. Contracts are generated and checked.
8. Runbooks exist.
9. Feedback is captured.
10. Next-source roadmap is based on observed beta needs.
11. Critical MVP Gap Audit is green or has accepted exceptions with owners.
12. Failure Propagation Matrix is covered by API/mobile/support tests.

## First Implementation Milestone

The first milestone is not "monorepo exists". It is:

```text
POST /interests -> POST /source-bindings -> scheduled fake scan
-> normalized feed item -> generated mobile client can read feed
```

This milestone proves the architecture is runnable:

1. REST/OpenAPI generation works.
2. Tenant scoping works.
3. Domain/features/ports/adapters/interfaces are separated.
4. Idempotency and outbox are present on write paths.
5. Worker/job path can produce user-visible data.
6. Mobile can consume generated contracts through adapters.

Do not optimize deployment topology, add more sources or tune summary prompts before this milestone passes.
