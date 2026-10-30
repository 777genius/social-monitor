# Command outbox lease reliability: six-pass refactor

Status: implementation and independent review in progress. Base: `2794a49380d5709705996524593cd45d15b0bd51`.

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
