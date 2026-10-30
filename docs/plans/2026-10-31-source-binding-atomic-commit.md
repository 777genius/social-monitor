# Source binding atomic creation: architecture and recovery plan

Status: draft, implementation and validation in progress. Independent of command-outbox PR #591.
Base: `2794a49380d5709705996524593cd45d15b0bd51`.

## Reproduced architectural risks

`BindSourceUseCase` currently performs:
1. independent `idempotency.get`;
2. independent interest/catalog and binding reads;
3. capacity check from the first **100** bindings;
4. `bindings.save`, `outbox.append`, `idempotency.set` as three commits.

Process crash between writes can leave a visible binding with **no event or
receipt**. Concurrency can over-admit capacity, overwrite the same receipt,
or create duplicate bindings for the same canonical provider/config identity.
The existing lookup uses the caller's provider alias rather than the resolved
canonical `capability.providerKey`, so aliases can bypass duplicate detection.

## Narrow design

- Add `SourceBindingCreationCommitPort` to the monitoring application
  boundary: one durable effect owns binding + source-enabled domain event +
  scoped immutable idempotency receipt.
- Keep validation and secret encryption in the use case. The port receives the
  already-protected aggregate, the validated non-secret config identity, a
  complete event envelope and a provider-canonical identity.
- The Prisma adapter uses the existing Serializable transaction/write retry,
  rechecks scoped interest existence, provider identity and **full** enabled
  capacity under the transaction; no new table, generic repository or feature
  flag.
- A duplicate canonical identity resolves to the existing source binding,
  without inventing a new event. The same idempotency key always resolves to
  the original successful receipt; failure rolls back *all* writes.
- The local in-memory adapter shares the existing monitoring receipts/events
  state, publishing binding+event+receipt synchronously as one observable step.
- Keep unrelated source-binding operations and future source configurations
  outside this PR. Mixed old/new API writers are not supported for the
  stronger first-key-wins invariant: drain old writers before upgrade.

## Six critical passes

1. Validate collision, identity/canonical-provider semantics and existing API.
2. Design narrow application capability and transactional Prisma adapter.
3. Implement memory parity without nested awaits/partially visible updates.
4. Adversarial tests: concurrent binding, capacity, replay, rollback, scope,
   missing catalog/interest and encrypted secrets.
5. Full backend E2E, TypeScript, native PostgreSQL 18, source-certification,
   architecture and build quality checks.
6. Independent Strix/CodeRabbit review, correct findings and merge only when
   the exact final head is green and no critical review threads remain.

## Constraints

Do not rewrite historical receipts or fabricate previously lost events.
Retain current response JSON and OpenAPI (no breaking API changes).
No new migration is intended. Production role/RLS and worker drain constraints
are unchanged; no deployment or historical recovery is claimed by this work.

## Evidence

Record concrete test counts, CI run SHA, reviewer findings and unresolved
risks here when verification completes. Synthetic fixtures are not a live
production scan or external provider readiness proof.
