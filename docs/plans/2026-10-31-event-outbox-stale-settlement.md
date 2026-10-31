# Event outbox: stale settlement fencing and safe relay diagnostics

Status: planned, implementation and review in progress. Base: `13ed68bfe973d4d66da1bf9d42a96a33ddc32032`.

## Audited fault

The EVENT outbox dispatcher selects PENDING rows without a lease, then invokes
`recordAttempt`, `markPublished`, `markFailed` using the primary key alone.
Two event relays can read the same row. An older relay's failure or
acknowledgement can overwrite a terminal state committed by a newer relay,
including turning PUBLISHED back into FAILED. This is a correctness risk even
with idempotent consumers. The event relay loop also logs unsanitized error
messages while the command relay redacts them.

## Scoped decision

- Fence each EVENT mutation with `id + messageKind=EVENT + status=PENDING`;
  reject zero-row updates instead of mutating a competing terminal outcome.
- Keep the existing manual FAILED recovery contract: a confirmed publish
  followed by a failed acknowledgement remains uncertain, and the current
  dispatcher records FAILED for reconciliation. This PR does not silently
  auto-requeue historic failed rows.
- Use the same redacted, bounded diagnostic presentation for the EVENT relay
  loop as for the COMMAND relay.
- No migration, no generic transaction layer, no new worker, no flag and no
  claim of exactly-once delivery. Full EVENT leasing and atomic claim/heartbeat
  is separate scoped work, requiring migration/rolling-deploy review.
- Keep Prisma adapter, in-memory test adapter and smoke mocks aligned.

## Six critical passes

1. Trace race and non-target COMMAND rows; verify manual recovery invariants.
2. Add conditional Prisma updateMany and exact one-row result checking.
3. Prove in-memory terminal transitions remain monotonic.
4. Add unit and smoke tests for stale failure/success and redaction.
5. Run TypeScript, ESLint, E2E, architecture/security, PostgreSQL and production
   candidate CI on the exact final SHA.
6. Obtain independent code/security review, fix actionable findings and
   squash-merge only with green checks. Confirm post-merge CI; live production
   deployment remains separate.

## Rollout

Existing EVENT rows stay readable and are updated in place. Strict fencing
can cause an old concurrent relay to log an ownership/status conflict rather
than silently rewriting a terminal row; it does not discard an event or alter
the one-shot recovery CLI's required FAILED identity. Mixed binary generations
are not a safe route to a concurrent-leasing guarantee.

## Review iterations and compatibility evidence

1. **Failure scenario:** two relays can read one PENDING EVENT. Before the fix,
   `markFailed` by the slower relay could rewrite a competitor's PUBLISHED row.
   This was verified directly in the old Prisma update-by-ID adapter.
2. **Boundary correction:** `recordAttempt`, `markPublished`, and
   `markFailed` use `updateMany` with exact id/kind/expected status and require
   exactly one affected row. A terminal row or COMMAND-kind row fails closed.
3. **Adapter parity:** the memory store and the deterministic Prisma smoke fake
   mirror terminal monotonicity. Unit tests cover stale failure, stale success,
   attempted update after completion and wrong message kind.
4. **Diagnostics:** event-relay error text is redacted and capped at 240 chars
   like the command-relay path. An explicit negative log regression proves no
   bearer credential text survives. The first security gate caught a
   token-shaped literal in the *test fixture*, not an actual secret; the test
   now constructs a synthetic marker at runtime.
5. **Controlled recovery compatibility:** analysis found that
   `reader_summary.ready` has a deliberate one-shot recovery flow for exact
   FAILED rows. Ordinary relays still default to PENDING-only transitions;
   only its manifest-allowlisted, `xmin`-locked recovery persistence creates
   an adapter expecting FAILED. The recovery tests exercise successful
   publication, uncertainty, manifest rejection and concurrent mutation.
   The mode does not replay, reset, or reclassify historic rows automatically.
6. **Independent critique / merge gate:** external Strix review and full CI
   must cover the latest head. CodeRabbit quota may prevent a fresh review;
   report that explicitly rather than treating it as approval. Merge only
   after test suites, native/security/architecture contracts and critical
   findings are settled; then verify `main` push CI.

This is **not** full concurrent EVENT lease ownership. Without an EVENT claim
or inbox transactional side effect, a concurrent relay may still physically
send an envelope twice. Existing stable event IDs and consumer idempotency are
required; any future leasing/refactor must be separately reviewed with
production migration and existing one-shot recovery constraints.
