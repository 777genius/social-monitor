# Command outbox lease reliability: six-pass refactor

Status: six implementation/review passes completed; final CI on the latest head remains the merge gate. Base: `2794a49380d5709705996524593cd45d15b0bd51`.

## Why this boundary

`CommandOutboxDispatcher` takes a batch-wide 30-second lease, then publishes
commands **sequentially**. A slow broker or a deep batch can exhaust the lease
before later records even start. A second relay can claim and publish the same
command; the old owner may also continue issuing external effects, with no
renewal or fail-closed ownership check. This affects ingestion and delivery
commands, including the durable dispatch work introduced in #588.

## Decision

Stay inside the existing modular-monolith boundaries:
- `platform-queue`: narrow command outbox lease contract, dispatch lifecycle,
  failure/ownership classification; no generic workflow/DI framework.
- Prisma adapter: renew only rows with matching owner, PENDING status, and
  **unexpired** lease, as one bounded scoped operation; preserve Serializable
  claims and existing retry/terminal scan semantics.
- Delivery in-memory adapter: same lease ownership rules for development/E2E.
- Relay composition: no new service, tables, or feature flags. All relays retain
  the existing command IDs, routing and at-least-once semantics.
- Never claim exactly-once external sends: publisher confirms and DB acknowledgment
  can remain ambiguous. Losing ownership must stop starting new sends and must not
  mark a competing owner's message PUBLISHED/FAILED.

## Six review / improvement passes

1. **Diagnosis and invariants.** Reproduce long-running batch, stale owner,
   broker delay, concurrent claim, and cancellation/cleanup risks; establish
   what the current behavior guarantees.
2. **Atomic lease renewal.** Add a typed renewal capability to the existing
   port and Prisma adapter; reject stale/expired owners without resetting attempts
   or changing outbox state.
3. **Dispatcher orchestration.** Add bounded, non-overlapping batch heartbeat;
   prevent later sends after lease uncertainty; preserve existing backoff,
   max-attempts and redaction semantics. Never treat an unconfirmed send as success.
4. **Adapter parity / integration.** Enforce the same rules in-memory, update
   live relay smoke fixtures, and check shutdown/error paths.
5. **Regression, E2E and compatibility.** Exercise slow publication, concurrent
   claimers, transient DB failure, subsequent recovery, and normal publish,
   then run TypeScript, architecture/security gates and full GitHub CI.
6. **Adversarial review and corrections.** Independently critique races,
   availability and rollout behavior, fix actionable findings, rerun final CI
   and merge only with green head + no unresolved critical review findings.

## Production / rollback

No schema migration is intended: COMMAND rows already have
`lease_owner`, `leased_until`, `publish_attempts`, `available_at`.
New and old workers share those columns, but the old implementation cannot
renew claims; mixed worker generations may produce duplicate at-least-once
delivery while transitioning. Avoid simultaneous deployment of old and new
relay workers; drain/stop old relay before resuming the new one.
The regular `main` push may trigger release workflows; verify rollout gates
before merging. Do not claim a production deployment without actual evidence.

## Evidence contract

Keep real unit/E2E smoke and native PostgreSQL checks. Verify the exact final
head after the last fix, not historical passing checks. Keep progress/limitations
in this plan, never replace tests with static checkmarks.

## Review record (six passes)

1. **Invariants / diagnosis.** The old batch lease began before sequential
   broker confirmations and had no heartbeat. Verified duplicate-risk window:
   later records could be reclaimed before their send even began. Rejected
   widening the delivery domain or inventing a generic workflow runtime.
2. **Persistence boundary.** Introduced `renewClaims` with one update for an
   entire bounded owner batch. The original implementation compared expiration
   with caller-captured time, which reviewers correctly flagged as a TOCTOU
   bug. Renewal and both settlement paths now use parameterized
   `UPDATE ... leased_until > clock_timestamp()` on PostgreSQL. The owning
   transaction retains the terminal scan-job write and its rollback behavior.
3. **Orchestration / ambiguous sends.** A single non-overlapping heartbeat
   renews waiting and in-flight work; failure or lost ownership prevents later
   sends. The success/failure path tracks the rejection flag independently
   of the thrown value, so even `Promise.reject(undefined)` cannot be treated
   as a successful publish. A broker-confirm/database-ack split remains
   at-least-once; no false exactly-once claim is introduced.
4. **Adapter parity / lifecycle.** Development in-memory outbox uses the same
   owner, status and expiry predicates. Claimed rows are removed from the
   heartbeat before settlement; stale owner acknowledgments fail. Interval
   timers are cleared and awaited on shutdown/failure; pending rows recover
   after their lease rather than being forcibly settled by an ex-owner.
5. **Adversarial unit / native contracts.** Added slow sequential publishing,
   denied renewal, transient SQL failure, expiration, duplicate IDs, stale
   ownership, all-or-none renewal and real PostgreSQL recovery tests. A review
   found the shared fixture's global command claim could consume an unrelated
   command: both claims now fail closed if other runnable COMMAND rows exist.
   Native tests use database time and backdate **only their own fixture row**
   to reproduce an expired lease despite an earlier client timestamp.
6. **Independent critics and corrective loop.** CodeRabbit identified four
   actionable points: DB-time renewal, DB-time success/failure settlement,
   unused test-spy argument and native-fixture claim isolation. The four
   have targeted changes and regression assertions. Strix completed its first
   security review without open findings, while explicitly documenting
   unavoidable at-least-once ambiguity. A fresh CI run and any subsequent
   incremental review are required before resolving the threads or merging.

## Verification and rollout decision

The old CI run `41139475313` confirmed backend E2E, PostgreSQL 18,
production candidate and security contracts but rejected one unused mock
argument; the correction was pushed separately. Subsequent commits also
changed SQL lease predicates and native evidence. **That old passing subset is
not a green validation of the final head.** Inspect the latest PR head and its
complete GitHub Actions run, including all unit shards, native PostgreSQL,
production candidate, static architecture and deployment lifecycle, then
review unresolved comments before merge.

There is no production deployment in this PR. The existing production
transition authority may reject a normal main push; do not bypass that guard.
For application rollout, stop old relays before the new generation processes
queued COMMAND rows. The persisted command IDs, status and message schema stay
compatible; external effects remain at-least-once.
