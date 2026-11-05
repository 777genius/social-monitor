# Atomic source-binding status changes and resume quota

Status: implementation / adversarial review. Base: `8c46b62f8f8983c7a1f44ce98644bdde573182f2`.

## Why

The existing `ChangeSourceBindingStatusUseCase` separately saves the source binding,
emits a status-changed event and records the idempotency receipt. Crashes can
leave a changed status without event or receipt. More importantly, `resume()`
does not check `maxEnabledSourcesPerInterest`: pausing an enabled source,
creating a replacement at the same capacity, then resuming the paused source
exceeds the quota. Concurrent resumes or creation+resume can race.

## Design

- Introduce a **narrow monitoring application port** for an atomic status change.
- Keep command validation, ID generation, time and public API at the application edge.
- Prisma adapter: one Serializable transaction with scoped receipt reservation,
  re-fetch of exact tenant/workspace/interest/binding, a full unbounded
  enabled-source count before resume, conditional status update, event insert
  and immutable receipt settlement. Roll back all effects on rejection.
- In-memory adapter: use the existing shared source-binding/event/receipt state
  with one synchronous publish; enforce the same limit and replay semantics.
- No new table, migration, transport abstraction or feature flag. Reuse the
  capacity configuration from `monitoring-capacity-limit-provider`.
- Keep audit paths and consumers unchanged. Status event only when state changed;
  replay and already-equal state create no new event.
- No exactly-once guarantee outside the DB; if old writers run concurrently,
  they do not respect this invariant. Drain old API writers on deployment.

## Six critical/review passes

1. Verify old resume over-capacity and missing-event failure windows.
2. Define source status command/receipt and pure transition decision.
3. Build Prisma atomic transition, including scoped, concurrent and rollback cases.
4. Add shared-state parity and regression/unit tests (no adapters in feature unit tests).
5. Run full GitHub CI, TypeScript, architecture, PostgreSQL native tests, REST E2E,
   and check original response/error compatibility.
6. Independent CodeRabbit / Strix critique; fix concrete findings, re-run CI on
   exact final SHA, merge only if green, no unresolved critical threads.

## Verification constraints

Synthetic fixtures alone are not production E2E. No production deploy/restart or
historic receipt repair is authorized. Do not weaken security quality gates.
The `main` push may trigger downstream workflows; verify results after merging.
