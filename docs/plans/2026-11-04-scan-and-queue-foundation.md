# Scan admission and queue delivery foundation

## Goal and baseline

Refactor the existing scan-to-worker path so new providers and worker flows cannot
silently create a second admission policy, bypass transactional dispatch, or lose
queue ownership. Keep the modular monolith, existing bounded contexts and public
behavior. This is a substantial change across production code, composition,
fixtures and workflow tests; 15–25k changed lines are acceptable when justified by
that work, not a completion quota.

Research baseline: `e5442293fc6d5de6fc2eaae93a6dfade534bdf26` on `main`.
Research and independent critics: GPT-6 Astra with ultra reasoning.

The October 30/31 reliability work and PRs #614–#616 are already merged. Their
original fault tables are historical evidence, not new findings. Preserve atomic
interest/source-binding writes, command-outbox leases, channel-generation fencing,
delivery execution ownership, URL safeguards and existing runtime selectors.

Open feature work stays separate: #613/#617 own daily editorial generation,
#597 owns X collector acquisition, #391 owns Nomad and #129 owns find-in-page.
Complete changed-file inventories show no overlap with the worker queue readers,
monitoring policy or platform queue files in this plan. Summary **transport** is
included because it repeats the same demonstrated queue fault; summary content,
ranking, publication authority, DTOs and frontend are outside this work.

## Verified findings

| Priority | Current finding | Evidence and consequence |
| --- | --- | --- |
| P1 | Optional scan dispatch leaves an unsafe exported use-case path | With `RequestScanUseCase` constructed without `ScanDispatchPort`, a queue failure leaves a requested job and event. Retry with the same idempotency key reports success without another enqueue. Production Nest composition already supplies the safe adapter; this is an application/composition invariant gap, not a claimed deployed incident. |
| P1 | In-memory command readers do not implement rejection semantics | Scan, delivery and summary readers destructively drain the publisher, then implement both settlement methods as no-ops. `nack({requeue:true})` produces zero redeliveries, so local workflow tests cannot prove production recovery. |
| P1 | RabbitMQ partial acquisition can strand accepted deliveries | A valid first `get` followed by a failing second `get` rejects the whole drain with zero releases of the first message. The same pattern exists in command and summary-ready event readers. |
| P1 | Worker settlement failure can abandon the rest of a batch | A first handler/nack failure exits a delivery loop before later acquired messages are processed or released. Handler failures and broker acknowledgment failures share a catch branch, allowing transport uncertainty to become a terminal business rejection. |
| P2 | Admission policy is duplicated across command and read paths | Manual request, scheduled scans and source-binding health independently combine cadence, freshness, rate limiting and provider failure history. Failure classification is reached through a presentation view. New provider rules can drift between these paths. |
| P2 | Persistence readiness discovery depends on its own declarations | An imported provider omitted from `adapterSourceFiles` is invisible. Even a declared provider's `Noop*Adapter` is invisible to the separate module-only noop scan. Both false negatives reproduce with valid isolated fixtures. |

Baseline focused monitoring suites: 59 tests pass in request, scheduling, health
and direct-dispatch suites. Baseline architecture gate: 28 negative/positive
fixture tests pass. Existing green checks therefore do not cover these failures.

## Scope and non-goals

In scope: monitoring admission/domain policy, mandatory existing scan dispatch,
all affected constructors and deterministic integration harnesses; platform queue
delivery ownership; three command reader wrappers serving four queues; the
summary-ready event reader; five worker drain loops; composition readiness
discovery; existing oversized tests touched by these changes.

No new deployment, database migration, service, workflow engine, DI framework,
generic repository/unit-of-work framework, dependency upgrade, feature flag,
provider behavior, public endpoint, API shape or generated client. No real-user
projects, live provider calls, production data changes or real notifications.
EVENT outbox leasing and execution-lease fencing of non-article source writes
remain separate designs; neither is silently folded into this refactor.

## A. Monitoring admission and required dispatch

### Ownership

- Domain owns provider cadence, scan failure classification, freshness/backoff
  facts and admission decisions over immutable snapshots and an explicit `now`.
- Application use cases own repository reads, manual idempotency/quota,
  scheduler iteration and dispatch orchestration.
- Presenters map domain decisions into each existing response vocabulary. A
  domain decision never imports a REST DTO or presentation result.
- The existing `ScanDispatchPort` is required. Use cases may query queue
  capacity, but cannot directly enqueue, append events or save creation state.
- Existing direct/Prisma dispatch adapters remain the implementation boundary.
  Direct dispatch still requires rollback-capable local stores; Prisma commits
  job, event and command outbox in one Serializable write transaction.

### Implementation

1. Move existing provider cadence and failure classification into named domain
   policies, retaining data and fallback behavior. Update in-scope consumers;
   retain only narrow re-exports if excluded consumers need source compatibility.
2. Introduce a small scan-admission policy with distinct manual and scheduled
   entrypoints when their inputs differ. Share the actual business calculations,
   not a configurable pipeline of boolean switches or subclass hierarchy.
3. Separate manual decision presentation and scheduler/health projection from
   the common policy. Keep scope and repository queries explicit at call sites.
4. Require dispatch in request/scheduler constructors and remove sequential
   fallback paths and unused write dependencies. Use a named dispatch-plan
   builder only for job/command/event construction that truly has one owner.
5. Update Nest providers, all constructor fixtures and eight affected smoke
   flows. The cross-process fixture must compose Prisma dispatch and command
   relay; a RabbitMQ publisher must never be disguised as rollback-capable.
6. Split changed oversized request/scheduler specs by workflow, retaining every
   existing assertion and moving shared fixture composition into support files.
   Remove their line-cap debt exemptions once below the limit.

### Behavior to preserve

- Manual cached/existing-key replay happens before binding/policy checks.
- Manual requests have quota and ignore `nextRunAt`; scheduled scans have a due
  window and duplicate-window check and do not spend manual quota.
- Precedence remains active scan, scheduled duplicate window, fresh successful
  result, rate-limit backoff, provider-failure backoff, then eligible.
- Freshness deadline equality remains fresh; backoff equality is eligible.
  Incomplete successful collection must not suppress a new scan.
- Admission reads five recent jobs; health metrics retain their 50-job/24h
  window. Preserve metadata-first classification and legacy reason fallback.
- Preserve the 900-second transient cap, 30-second reset buffer, two-failure
  threshold and maximum multiplier four.
- Scheduler next-run adjustment and health's reported freshness deadline are
  different contracts. Preserve their existing combined-state precedence.
- Keep scoped reads, command/event IDs, retry budget, correlation/causation IDs,
  manual-only requested event, and typed failure/status vocabulary unchanged.

## B. Queue delivery ownership and worker settlement

### Ownership

- Platform queue exposes a narrow delivery contract (diagnostics, ack, nack),
  command delivery/read contracts and a batch owner for unsettled deliveries.
- Concrete in-memory/RabbitMQ implementations stay on explicit adapter paths.
  Root barrels export contracts/primitives, not concrete adapters.
- App wrappers retain existing Nest tokens, constructors and worker-specific
  configuration. Business handler/retry decisions remain in their worker loops.
- The summary-ready event decoder and topic bindings remain event-specific;
  share only acquisition/settlement lifecycle with command readers.

### Implementation

1. Add one shared command-envelope decoder and RabbitMQ command reader. Preserve
   accepted field rules, wrong-command rejection, queue arguments, delivery
   limits, dead-letter declarations and diagnostics.
2. Add a small RabbitMQ batch acquisition primitive. If a later read, decode
   rejection or rejection settlement fails, attempt to requeue every accepted
   delivery already acquired. Preserve the primary failure and expose cleanup
   failures; never stop cleanup after the first rejection.
3. Add in-memory reservation/settlement without changing the publisher's legacy
   destructive `drain` API for unrelated consumers. A successful ack removes a
   reservation, nack(true) requeues it, nack(false) removes it, and a settled
   delivery cannot be settled again. Redelivery diagnostics reflect requeue.
4. Migrate scan, delivery-attempt and summary command wrappers to the shared
   implementations. Keep the two distinct summary queue tokens.
5. Reuse acquisition cleanup for summary-ready events while preserving object
   root validation, the two allowed event types, exact routing-key equality,
   topic exchange, both queue bindings and the disabled-reader behavior.
6. Migrate five loops to explicit batch ownership and final cleanup. Separate
   handler disposition from broker settlement failures. Mark a delivery settled
   only after successful acknowledgment/rejection; release every remaining
   delivery on abort/shutdown and report uncertain settlement.

### Behavior to preserve and failure cases

- Existing `AmqplibRabbitMqChannel` remains the sole owner of origin-channel
  identity, stale-generation rejection and duplicate settlement checks.
- Poison/wrong-command messages are rejected once without requeue and count
  against the bounded read limit. Valid siblings remain recoverable.
- Validate positive integer drain limits consistently before broker calls.
- Worker backpressure and shutdown requeue; ordinary handler failures retain
  each worker's existing disposition. Broker errors are not handler failures.
- Scan retry heartbeat, claim ownership and durable retry settlement remain
  local to the ingestion loop. Cleanup must not release a newly claimed owner.
- Startup stays fail-fast. Interval failures remain contained and later ticks
  can proceed. Existing metrics dimensions and counters retain their meaning.
- Delivery remains at least once. No in-memory or database refactor claims
  exactly-once provider effects after an uncertain remote acknowledgment.

## C. Executable composition inventory

1. Reproduce missing provider/noop declarations in isolated fixture trees.
2. Discover runtime imports/re-exports from existing module roots independently
   of the readiness contract. Traverse only the relevant local composition
   scope; stop at other modules/adapters/business layers and avoid following
   every imported dependency in the repository.
3. Use TypeScript syntax parsing for runtime references and configured path
   aliases. Type-only imports, comments and fixtures must not create false
   adapter declarations; unresolved relevant local composition imports fail
   with a specific diagnostic.
4. Use the same discovered source closure for stateful and noop checks. Keep
   explicit context/owner/risk/replacement declarations and reject missing or
   stale inventory; do not add blanket exceptions to make the gate pass.
5. Keep the existing npm gate name and CI invocation. New executable source is
   TypeScript; no new handwritten `.mjs`/`.mts` implementation files.

## Verification and evidence

Use the smallest set that proves the changed contracts, reusing existing broad
coverage. Add focused regression tests only for the demonstrated high-risk
failures and new shared lifecycle/policy boundary, not tests of every wrapper.

| Surface | Required evidence |
| --- | --- |
| Admission | Existing manual/scheduled/health suites; policy parity at precedence and deadline boundaries; failed dispatch followed by same-key retry; scope/idempotency/quota assertions. |
| Local delivery | Contract scenarios for ack, reject, requeue/redelivery, duplicate settlement, concurrent readers and shutdown/unprocessed batch release. |
| RabbitMQ | Partial acquisition and rejection failure; origin-channel/closed-channel regressions; cleanup attempts all siblings; poison/routing mismatch; unchanged route topology/diagnostics. |
| Workers | Existing five loop suites; ack failure cannot become terminal handler rejection; first settlement failure releases later deliveries; existing retry heartbeat and shutdown cases. |
| Composition | Negative and positive readiness fixture tests; runtime selectors; actual modules boot; OpenAPI isolated harness remains valid. |
| Integrated path | Deterministic API-to-ingestion/scheduled/manual scan E2E; cross-process scheduler/command relay; delivery drain; summary/reader-summary drain; summary-ready projection integration. |
| Repository | Build/typecheck, architecture, code quality, source-line cap, changed-file lint, persistence-readiness, runtime guards and `git diff --check`; full backend E2E and required remote checks on final head. |

Real database/broker claims require their actual isolated integration evidence.
Fixture checks demonstrate contracts and orchestration, not live provider or
production readiness. Do not weaken quality, security, CI or review gates to
complete the task. Record any environment limitation precisely.

## Delivery and review sequence

1. Commit and publish this researched plan; open a draft PR.
2. Independent critics review scope, compatibility, failure ownership and test
   sufficiency before implementation. Record corrections below.
3. Implement cohesive slices with disjoint file ownership. Publish each finished
   commit immediately through the connected GitHub account.
4. Run focused gates during implementation, then integrated checks. Review the
   combined diff in multiple independent rounds; fix substantive findings and
   re-review changed risks until no unresolved findings remain.
5. Verify required checks and review the exact final commit; mark the PR ready
   only when implementation and evidence are complete. Report links, concrete
   structural improvements, tests and any material limits.

## Decisions, progress and review corrections

Implementation and review evidence will be appended here. No implementation
completion or final verification is claimed by this initial plan.
