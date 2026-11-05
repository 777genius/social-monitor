# Source binding atomic creation: architecture and recovery plan

Status: implementation and focused corrections committed; final CI/review on current head remain merge gates. Independent of merged command-outbox PR #591.
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

## Six-pass implementation / critique record (2026-10-31)

1. **Architecture/invariants:** confirmed three separately committed writes in
   `BindSourceUseCase` could persist an aggregate without its event or receipt;
   rejected a generic transaction service and kept a narrow monitoring port.
2. **Serializable persistence:** now rechecks scoped interest/catalog, canonical
   source identity and the full enabled count inside a single transaction;
   binding/event/receipt either commit together or all roll back.
3. **In-memory and composition parity:** the same interest-creation state now
   backs source bindings, receipt readers and local event readers. REST DI and
   Telegram, API and autonomous fixture compositions use the atomic port.
4. **Adversarial persistence cases:** focused tests check fault injection after
   binding insert, no orphan event/receipt, immutable replay, canonical
   duplicates, out-of-capacity rejection and two contenders for the last slot.
5. **CI corrections:** first full PR workflow `41143167884` failed on
   unused/type-only imports, a duplicate local name in native PostgreSQL
   checks and two legacy fake Prisma objects missing the new create/count
   delegates. Fixed these without weakening static gates. A second native
   test now forces two Serializable transactions to read the same canonical
   identity as absent before they attempt to create it; expected result is
   one binding/event and two scoped receipts.
6. **Independent review / final gate:** initial Strix review found no open
   security issue on the earlier head but noted that source-binding resume
   capacity enforcement is an *untouched* separate issue; CodeRabbit was
   rate-limited then. Both have been explicitly requested again on the
   latest code. Reviewers and complete GitHub Actions on the **final head**
   (including PostgreSQL 18, E2E, static quality, unit shards, deployment
   lifecycle) remain mandatory before a merge claim.

## Deliberate limitations

- No new database constraint or migration for arbitrary JSON identity fields:
  SERIALIZABLE prevents concurrent phantom duplicates only among cooperating
  new writers. A deployment must drain old non-transactional binding creators.
- The change does not backfill historical missing events, repair orphan bindings
  from old failures, or change the separate binding resume policy.
- Production provider behavior and deployment cannot be proven from the
  deterministic tests; `main` merge is not a production rollout.
