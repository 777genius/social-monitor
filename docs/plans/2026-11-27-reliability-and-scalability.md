# Reliable background work and bounded multi-user load

## Purpose and delivery

Deliver one Draft PR in `777genius/social-monitor` that makes the existing backend
recover from component failures and keeps per-process work bounded as the number
of workspaces increases. Preserve the existing product, architecture, tenant
boundaries, and public contracts. Implementation and executable failure/recovery
evidence are the deliverable; documentation volume is not a proxy for completion.

Baseline: `main` at `9611b22340dffbd05f77af37618c7a9f00ce128a`, inspected on
2026-11-27. This plan is reviewed before implementation and updated with actual
decisions, evidence, and any explicitly unresolved limits. The target is roughly
10,000–20,000 useful changed source/test lines, not a minimum to manufacture.
Generated output, vendored code, lockfiles and copied audit inventories do not
count toward the useful estimate.

The user requested a Draft PR and autonomous end-to-end implementation/review.
Keep the PR Draft; this work does not authorize a production rollout. Push each
completed commit immediately. Do not mark queued, skipped, cancelled, earlier-SHA
checks, or synthetic fixtures as a successful live production verification.

## Existing work and collision boundaries

| PR | Verified state at planning | Boundary for this PR |
| --- | --- | --- |
| #665 | Merged, `c0b8b467` | Reuse model adapter separation; do not extract it again. |
| #790 | Merged, `9b5f8db9` | Preserve domain import guard and exact existing exceptions. |
| #796 / #797 | Merged; #797 is baseline | Preserve response admission fixes and awaited PostgreSQL fixture shutdown. |
| #793 | Open, `6789d767` | Independently owns Node/TS7/SDK, summary snapshot contracts, package/Jest/toolchain/CI. |
| #783 | Draft, `e26517c1` | Independently owns external-beta evidence/readiness and dependency audit admission. |
| #798 | Open, `60430924` | Weekly OpenAI response-envelope fix; leave its files alone. |
| #799 | Open, `05b361a6` | Public Likes deployment readiness and lifecycle registry. |
| #800 | Open, `ca627da2` | Scweet dependency update; not proof of live X recovery. |
| #795 | Open, `41c80491` | November archive admission scripts. |
| #620 | Open, `008cbd82` | Historical deployment membership fix; do not integrate blindly. |
| #710 / #711 | Open disposable experiments | Explicitly excluded, do not merge. |

Recheck this matrix before integration. Do not retarget, close, overwrite, merge,
or claim completion of another owner's PR as part of this program. Root package,
Jest and CI files may change only for a necessary qualified test registration,
after checking the current overlapping diff. Prefer the existing discovery paths.

## Concrete problems found in the baseline

1. The EVENT outbox dispatcher permanently marks a publication failure `FAILED`.
   Ordinary polling only reads `PENDING`; temporary broker failures consequently
   require explicit recovery. Multiple relays can also read the same pending row
   without ownership. Existing claim columns and a dispatch index can be reused.
2. RabbitMQ publishers interpret the local write-buffer Boolean as publication
   failure even after the exact send receives a broker confirmation. Confirmation
   waits have no deadline, closed channels remain strongly held in a connection's
   channel set, and cached topology is not coupled to a connection generation.
3. Periodic reader-summary scheduling rereads the first policy page on every tick.
   Policies beyond the limit, or later cadences within one policy, can starve.
   A recovery-discovery error can also terminate an entire scheduling batch.
4. Digest assembly saves the digest before creating its delivery attempt. After
   a failure in the latter operation, the existing-digest branch returns success
   without repairing delivery and the scheduler advances the schedule.
5. Bootstrap cache capacity bounds completed values but not in-flight loads.
   Baseline execution reproduced 1,000 simultaneous misses at a two-entry cache
   limit, a 128-load refresh burst, and eviction of a valid unrelated stale entry
   when refreshing an existing key at capacity.
6. Realtime subscription reads the replay before joining its room. An event in
   that interval can miss both the replay and live delivery. This is a freshness
   gap in a best-effort hint transport, not loss of the durable read model.
   Unexpected websocket errors also expose raw messages unlike the HTTP boundary.
7. Source-binding listing performs repeated source-catalog lookups for each row.
   This amplifies request work against the existing small API PostgreSQL pool.
8. Generic interest SummaryJob request, execution claim, completion and event
   handoff contain separate persistence/external-send windows. A request can be
   saved without a queued command; concurrent consumers can both start a model;
   a terminal job can be overwritten after its event publication fails.

These are code or fixture findings. They are not attributed to a particular
production incident without corresponding production evidence.

## Non-negotiable invariants

- Tenant, workspace, user and subscription ownership remain checked at the same
  boundaries; new batch reads must retain the same predicates.
- Public REST/OpenAPI, frontend behavior, source ranking, prompts, model routing,
  quota limits and historical artifact bytes remain compatible.
- Delivery is at least once where already designed that way. Never promise
  exactly-once network delivery. Persisted inbox/idempotency must absorb repeats.
- A timeout never grants a stale worker permission to commit or start a second
  paid operation while the first still owns it. Cancellation and ownership are
  different facts; a timer alone is not proof that an external action stopped.
- An uncertain publish is not recorded as confirmed. Local buffer pressure is
  not a broker negative acknowledgment. Preserve mandatory-return correlation.
- Historical terminal EVENT rows remain under the existing explicit recovery
  policy. Automatic retries apply to new eligible dispatch attempts only.
- A failed component releases its own resources and leaves healthy siblings
  usable; cleanup must not close a replacement connection or erase its state.
- No new generic supervisor, message broker, distributed cache, service, framework,
  global exception-swallowing layer, or process-per-tenant architecture.
- Reuse existing clocks, IDs, Result errors, transaction retry, outbox columns,
  queue primitives and Nest composition. New domain code depends inward.
- No destructive migrations. Any necessary additive schema for SummaryJob must
  have explicit ownership semantics, compatibility and native database evidence.
- Human-written source and tests stay below the existing 1,000-line cap. Do not
  weaken gates, increase thresholds, hide errors or introduce broad exceptions.
- Tests use disposable fixtures, local synthetic identities and injected faults.
  No real user projects, provider secrets, paid model calls or production writes.

## Workstreams and exclusive ownership

| Workstream | Owner | Production/test estimate | Main paths |
| --- | --- | --- | --- |
| A. EVENT relay durability | Persistence agent | 1,500–2,500 / 2,000–3,000 | `libs/platform/events`, `apps/event-relay`, existing EVENT DB fixtures |
| B. RabbitMQ progress and recovery | Root | 700–1,300 / 900–1,500 | `libs/platform/queue/.../rabbitmq`, publisher adapters and broker tests |
| C. Fair scheduling and digest repair | Runtime agent | 600–1,000 / 1,200–2,000 | periodic summary policy/use case/loop, digest assembly/scheduler |
| D. Bounded bootstrap and realtime | API agent | 600–1,000 / 1,000–1,600 | API bootstrap cache, delivery websocket interface and affected E2E |
| E. Bounded database read amplification | Persistence agent after A | 150–350 / 300–650 | source-binding Prisma repository, targeted read contracts |
| F1. Atomic summary completion | Runtime agent after C + root review | 600–1,000 / 900–1,500 | generic SummaryJob completion/persistence/wiring; no automatic model redispatch |
| G. Integration and final review | Root + cross-reviewers | 250–500 / 500–900 | cross-component scenarios, operational notes and qualified test wiring |

Estimates overlap when existing scenarios are reused. Target the useful portion
of the 10–20k range; remove unnecessary abstractions and duplicate fixtures even
when doing so reduces the diff. Estimates are not promised measured throughput.

No concurrent editing of the same file. The persistence owner may extract the
existing command lease heartbeat into a narrowly shared lease helper, preserving
its existing public export and tests. Root owns RabbitMQ publisher semantics;
the EVENT owner must coordinate changes to its RabbitMQ publisher with root.
Root owns plan, PR metadata, dependency installation and integration commits.

## A. Recoverable, fenced EVENT dispatch

### Design

Use the existing EVENT row ownership/availability columns. Claim a bounded batch
atomically with `FOR UPDATE SKIP LOCKED`, keeping ordering deterministic and
excluding COMMAND and historical FAILED rows. PostgreSQL time controls lease
validity where a queued database request could otherwise use an old timestamp.

Retain `publishAttempts` as recorded dispatch starts, not batches claimed. Start
an attempt immediately before publication under the live owner; interrupted
claims that never publish must not consume attempts for untouched siblings.
Renew claims while processing, reusing the existing small heartbeat algorithm.
Fenced settlement requires row identity, owner and live lease. A stale owner may
neither mark published nor replace a newer owner's retry decision.

New failed dispatches receive bounded exponential backoff and a bounded number
of attempts, then terminal failure. Expose published/retrying/failed accurately.
Do not auto-replay old terminal rows. Preserve safe error redaction and the
existing manually reviewed xmin/identity recovery path.

Consumer audit prerequisite: the production binding accepts only `summary.ready`
and `reader_summary.ready`; their Prisma projection stores atomically commit
inbox plus projection and validate duplicate scope/identity. Keep those checks.
Broker ACK plus failed DB settlement remains an at-least-once outcome.

### Acceptance

- Two relays never claim the same eligible row concurrently.
- Broker unavailable, then restored: eligible event is eventually published
  without process restart; future retries do not busy-spin.
- Crash after claim, before publish: row becomes available after lease expiry.
- ACK before lost settlement: retry causes one effective consumer projection.
- Lost renewal/stale owner cannot settle, publish another batch item, or clear
  a replacement owner's state.
- Lease loss blocks starting another publisher call. An already admitted call
  may still progress asynchronously; its wire outcome remains uncertain and a
  lease alone never retracts bytes already handed to the transport.
- Failure recording failure still leaves every sibling's cleanup reachable.
- Exhausted attempts are terminal; historical FAILED remains untouched.
- A crash after the last allowed recorded attempt is terminalized on reclaim
  without an extra send. Existing PENDING attempts are retained, never reset;
  unknown pre-instrumentation starts remain unknown.
- Envelope IDs, tenant/workspace scope and recorded-attempt semantics survive.

Mixed old/new EVENT relay versions cannot provide the new lease guarantee because
the old binary ignores ownership. Deployment instructions must require draining
and stopping the old relay before enabling multiple new replicas. No live rollout
is performed in this PR.

## B. RabbitMQ transport progress

Separate buffer flow control from publisher-confirm outcomes. A confirmed send
must not become a failed outbox attempt merely because `publish()` returned false.
Honor native drain/flow control before additional sends; avoid an unbounded queue
of buffered payloads. Preserve exact-send, generation and mandatory-return
correlation, including callbacks arriving after reconnect or cancellation.
Bound missing drain as well as missing confirmation. A confirmed send succeeds;
failure to drain affects admission of a subsequent send, not its predecessor's
already confirmed result. Channel close cleans both kinds of waiters.

Add a bounded confirmation wait with an explicit unknown-outcome error. Retire
only the affected native origin when it cannot make progress; clear pending
publications and prevent late callbacks from settling replacement sends. Never
claim that a timed-out send was not delivered. Keep consumer delivery tags bound
to their acquisition channel.

Remove closed channels from per-connection strong collections. Couple cached
declarations to a live generation so reconnect can reassert required topology
without doing multiple declaration RPCs on every healthy publish. Share one
in-flight assertion for a route; failed assertions remain retryable.

Acceptance: slow/negative/missing confirms; false buffer plus successful confirm;
mandatory return; duplicate message ID; disconnect at each acquisition stage;
late old callback; channel-only reconnect; consumer ACK on original channel;
close/reopen; no orphan timers/listeners or retained closed-channel growth.
Use a real disposable RabbitMQ broker for durable message round-trip/reconnect
when available, and state the exact distinction from fault-injection fixtures.

## C. Scheduling fairness and persisted delivery repair

### Periodic summaries

Use stable immutable policy-ID keysets rather than mutable `updatedAt` sorting.
Continuation includes policy, cadence and recovery-period progress, so a limit
of one still eventually visits every cadence. Keep constant-size continuation
in the owning loop; do not build an unbounded map per tenant. Preserve scoped
query predicates, UTC windows, recovery horizon and idempotency keys.
Bind the continuation to the configured scope and UTC scheduling day; explicitly
reset/rebase it at a day boundary. Store cadence identity, not an array index
that changes meaning when a policy is edited. Bound inspected/lookup work as
well as emitted summaries, including skipped historical recovery candidates.

Finish a complete sweep and wrap deterministically. Policy insert/update/delete
and disabled cadences must not corrupt continuation. A poison policy records a
bounded failure and lets later policies progress; a failure fetching the page
itself leaves continuation retryable. Stop does not acquire more work.

Acceptance: more workspaces than batch size; repeated ticks; `limit=1`; multiple
cadences/recovery periods; identical timestamps; scope isolation; policy deletion
or disabling between ticks; transient discovery failure; restart from beginning
without duplicate durable jobs. Test real loop-to-use-case-to-repository behavior.

### Digests

For an already persisted nonempty digest, ensure the idempotent delivery attempt
using the digest's persisted recipient, channel, window and content identity.
Do not rebuild content or use changed caller inputs to repair old work. Empty
digests remain no-delivery. Advance the schedule only after delivery admission.
Catch errors per digest schedule: a failed schedule stays due, while independent
later schedules continue. Do not convert a failed persistence write to success.

Acceptance: fail after digest save, recover on a later tick, one digest and one
delivery; concurrent retries; content/user settings changed meanwhile; permanent
delivery error remains visible; healthy independent schedules continue.

## D. API cache and realtime isolation

### Bootstrap

Keep the existing tenant/workspace/query cache key and fresh/stale semantics.
Bound distinct pending loads separately from stored entries. Coalesce identical
scope loads before applying capacity. A cold miss beyond capacity returns the
existing explicit backpressure contract rather than launching unlimited work.
A permitted stale value stays usable while a background refresh fails or cannot
be admitted. Background refresh has a small bounded concurrency and no unbounded
queue; expired/idle entries must not be kept alive merely by the refresh timer.
Define separate finite composition constants for stored entries, active loads
and the smaller background allowance. Track last caller access independently
from freshness. Rotate bounded refresh work so later scopes progress, and leave
foreground capacity available. Never free a slot on a timer while its real loader
continues; without an abort contract, ownership lasts until actual settlement.

Refreshing an existing key must not evict another live entry. Capacity must be
released after successful, failed or synchronous loader completion. Shutdown
stops new background work and cannot resurrect cleared state with a late result.
Integrate only lifecycle behavior supported by the current owner composition.

Acceptance: thousands of distinct pending misses stay within the bound; same-key
requests coalesce; different tenants never share; stale service on failure;
refresh at full cache capacity; refresh concurrency; TTL boundaries; recovery
after errors; HTTP load/isolation checks with controlled upstream latency.

### Websocket

Validate the complete channel/cursor/limit payload and authorize before joining.
Cursor validation preserves the current nonempty-string shape rule: an opaque
undecodable/stale cursor still reaches replay and may produce `resyncRequired`.
Keep current numeric/string limit normalization and the existing 1..100 range.
Close the replay/join freshness gap while keeping
the existing best-effort live hint semantics and stable replay cursor contract.
Keep the existing additive subscribe/refresh protocol; do not add unsubscribe
or superseding semantics. Admit at most one active replay operation per socket,
with existing backpressure for overlap and no unbounded serialized promise queue.
Subscribe failure or disconnect must release only a room newly joined by that
operation. Recheck disconnect after authorization, join and replay; a late join
cannot resurrect an abandoned grant. Failed refresh/duplicate subscribe leaves
existing successful rooms intact. Preserve event identity/cursor fields and the
client dedupe contract; do not add a server dedupe store or durable stream protocol.
The bound is per socket's replay work; it is not a claim of a new global
connection/room limit or multi-replica websocket fanout.

Unexpected failures use the same safe transport projection principles as HTTP;
never return raw dependency messages, SQL, credentials or connection URLs.
Expected domain codes keep supported client behavior. Native socket E2E proves
two-tenant isolation, event during subscription, reconnect and safe failure.

## E. Database round-trip amplification

Batch source-catalog lookups by distinct IDs/provider keys for a bounded source
binding page. Preserve caller scope, ordering, pagination cursor, filters and
missing-reference failure. Measure the query count on a 100-row page; it must be
constant bounded round trips rather than one query per result. Do not increase
the pool size to conceal an N+1 query pattern.

Investigate adjacent source-health fanout only if it can reuse an existing batch
read contract without widening REST contracts or creating a generic loader layer.
Any broader query redesign needs its own evidence before entering the diff.

## F1. Atomic generic SummaryJob completion

Three reviewers rejected a blanket automatic-recovery claim for generic paid
summary execution. The current model port has no durable attempt/reconciliation
or confirmed-cancellation contract. OpenAI uses `store: false`; a local timeout
does not prove remote work stopped. Quota reservation also lacks an idempotent
reservation identity/transaction boundary. Merely adding a lease and a command
row would create false safety, duplicate debits, and possible duplicate paid work.

Implement the independently complete finalization boundary: persist artifact,
terminal job and stable EVENT intent atomically behind a summary-owned contract.
Keep the model call outside the short transaction. A post-completion publication
failure must never overwrite the terminal job with the old RUNNING snapshot or
cause model regeneration on replay. Require expected running state/identity and
tenant/workspace in conditional persistence; do not introduce an optional fallback
that silently loses atomicity. In-memory and durable paths obey the same contract.

Before implementing, review whether existing running identity is sufficient for
the actual concurrent transitions. If a small atomic claim is necessary, include
and test it; never treat a lease deadline as authority to repeat paid execution.
Do not treat `startedAt` as a unique execution token. Prefer a required opaque
claim version returned atomically by the repository and compared by finalize/fail
(PostgreSQL row version may stay adapter-private; in-memory uses its own token).
Read terminal state after uncertain commit acknowledgement before attempting a
failure transition. A new schema is unnecessary if that adapter-private CAS
contract safely covers the actual transitions.

Required proof: transactional rollback at every finalization write; confirmed
terminal job with failed broker handoff; stable event replay; wrong tenant;
concurrent completion; preservation of existing terminal artifact; no model repeat
for a completed/no-signal job. The EVENT relay owns eventual event publication.

Explicit follow-up boundary, not claimed solved here: atomic request/quota/COMMAND
admission and reconciliation of a genuinely interrupted paid RUNNING operation.
That future design needs idempotent quota, provider outcome handling and explicit
summary-command routing (the present relay otherwise defaults to monitoring).
Keep such jobs visible; do not automatically steal or retry them based only on TTL.

## Execution sequence and review rounds

1. Audit current main and PR ownership; reproduce high-confidence failures.
2. Write this plan. Three independent critiques cover failure semantics, scope,
   concurrency/lifecycle, and test adequacy. Resolve critiques in this document.
3. Publish the reviewed plan in the single Draft PR. Start A/B/C/D in parallel
   with disjoint ownership. Add E after the EVENT transaction boundary stabilizes.
4. Add failing regression tests before each behavior fix where practical. Run
   each slice's focused tests; commit/push useful completed units immediately.
5. Review F1's transaction/state design before implementation. Re-estimate the
   total useful diff and remove low-value work before expanding any surface.
6. Cross-review A with B, C with D, and durable F1 with A. Review the exact diff,
   not only author summaries. Fix every reproduced critical/high finding.
7. Integrate and run architecture, runtime profile, source cap, type/build,
   affected unit tests and the full existing backend E2E suite. Run native DB
   and broker scenarios that prove the changed durable boundaries.
8. Run an independent final fault-focused review after fixes; repeat only for
   concrete remaining risks. Inspect automatic GitHub review and required checks
   on the current SHA. Preserve draft status and report exact qualified evidence.

CI queues are waiting, not blockers. Do useful code/review work while checks run;
do not spam reruns, relax gates, or manufacture approval. Keep overlapping #793
toolchain problems separate and clearly attributed if they affect qualification.

## Verification and evidence format

For each scenario record command, source SHA, environment, executed/passed/failed/
skipped counts, and the causal outcome. Raw totals from overlapping runs are not
additive. Keep logs local during work and commit a compact evidence document;
do not copy megabytes of CI output or create tests mirroring implementation.

Mandatory changed-surface checks follow repository rules. No full live-provider
`verify` command that starts prohibited real-user agent flows. Use deterministic
backend E2E plus disposable PostgreSQL/RabbitMQ and native socket clients.

Scale acceptance is structural and measurable: bounded in-flight work, constant
database round trips for the selected page, progression beyond first scheduling
page, unique active owners, and stable retry/backoff. It is not a claim of a
particular production users-per-second capacity without representative load.

## Review and execution log

- Audit round: complete; findings and ownership recorded above.
- Plan critique round 1: three independent reviews completed. Added retry-budget
  crash semantics, window-bound scheduler continuation, digest sibling isolation,
  actual cache ownership/fairness, bounded socket work and grant cleanup. Replaced
  unsafe full paid-workflow scope with explicit F1 atomic completion.
- Plan critique round 2: three reviewers accepted revised A–E and the narrowed
  F1 design gate. Clarified in-flight publication uncertainty, opaque execution
  identity, cursor compatibility and per-connection websocket bounds.
- Plan critique round 3: integration owner checked ownership and scope. Keep
  source-health-wide batching/provider caches/HTTP body work out of this PR;
  replace local publisher declaration caches with per-native-channel assertion
  coalescing, avoiding new public generation APIs or per-send declaration RPCs.
  Existing test discovery/native fixture entrypoints avoid package/CI conflicts.
- Implementation review round 1: A–E integrated and cross-reviewed. Fixed digest
  repair losing an explicit retry policy, background refresh moving its rotation
  key, and timeout cleanup confusing publication retirement with proven native
  channel closure. New broker regression retains retryable acquired delivery
  cleanup after a failed close and proves replacement-channel progress.
- Implementation review round 2: expanded the existing scheduler/outbox scope
  only for reproduced poison-page risks. Digest polling now carries a scoped
  due-time/ID continuation and retries earlier failures on bounded wrap. EVENT
  persistence failures isolate the uncertain row and require fresh database proof
  of all remaining claims before another send; systemic proof failure stops.
  A native PostgreSQL trigger scenario proves healthy sibling progress.
- F1 review: required atomic claim/complete/fail contract and constructor/DI
  wiring reviewed. Requested create-only artifact insertion so an identity
  collision cannot overwrite an existing result. New PostgreSQL/consumer tests
  and final source review remain in progress.
- Qualification: full existing workflow dispatched on c905885a at
  https://github.com/777genius/social-monitor/actions/runs/45930518717.
  The run was queued at this checkpoint. Local execution became unavailable;
  implementation test success is not claimed. Final combined SHA still needs
  executed focused, native and deterministic E2E qualification.
- Final review/qualification: not yet complete.

Primary transport references reviewed: [amqplib channel API](https://amqp-node.github.io/amqplib/channel_api.html)
and [RabbitMQ reliability guide](https://www.rabbitmq.com/docs/reliability).
