# Reliability and architecture foundation — 2026-10-30

## Purpose and baseline

Strengthen the existing modular monolith before further feature growth. The aim is
to fix verified failure paths and make their ownership explicit; folder renames,
new DI frameworks, microservices and generic repository frameworks are not part of
this work.

Audit baseline: `d25dfaf3acec422de50dc2861f781444b2e37ffa` on `main`.
Researchers and independent critics use GPT-6.1sol with xhigh reasoning.

Existing work is kept separate: PR #587 owns the gateway LLM transport, #391 owns
the Nomad vertical slice, and #129 owns Flutter find-in-page.

## Verified starting findings

| Priority | Finding | Evidence / consequence |
| --- | --- | --- |
| P1 | Scan attempt failure prematurely terminates the monitoring job | `ExecuteScanUseCase` reports failure before scheduling a retry; the real monitoring aggregate then rejects the successful retry with “Only enqueued scan jobs can complete”. Reproduced with the real in-memory integration. |
| P1 | Delivery dispatch races with enqueue persistence | Enqueue publishes before saving its transitioned aggregate. An immediate consumer can send, then the stale producer snapshot overwrites the final delivery state. |
| P1 | Delivery execution has no atomic ownership | Concurrent workers load the same queued attempt and both send. A thrown provider call leaves `sending` outside the scheduler's recovery set. |
| P1 | Webhook HTTP egress is not guarded at the connection boundary | Default redirect following can forward signed payloads to a different/internal destination; DNS results are not vetted and response bodies are unbounded. |
| P1 | Draining durable scan retries deletes work before processing | Retry rows are deleted at drain time; synthetic delivery ack/nack are no-ops. Shutdown or concurrent drains can lose or duplicate work. |
| P1 | Interest creation can commit without its domain event or receipt | A failed event append leaves the saved interest visible; retry finds its name and reports success without recreating the missing event. |
| P2 | Scan-history pagination loses one record per page | Both repositories emit the first omitted row as cursor, then skip that row on the next request. Five rows with a limit of two return only four rows. |
| P2 | Queue timer failures can escape the runtime boundary | Queue drain or settlement rejection escapes fire-and-forget interval callbacks. |
| P2 | Architecture gates miss real forbidden imports | Disposable fixtures demonstrate same-context domain-to-adapter imports, adapter barrels and some alias cycles pass the current gate. |

Event-outbox recovery/leases remain a separate research candidate. Broker
generation ownership and interest-creation atomicity were reproduced and scoped
below before implementation.

## Invariants and ownership

1. A scan attempt and a monitoring job have different lifecycles. Transient
   attempt failure must not make a scheduled retry unable to finish the job.
   Successful persistence must never be rewritten as provider failure merely
   because outcome reporting failed.
2. Work remains durable until acknowledged. Failure, shutdown and concurrent
   consumers must preserve retryability; only the current owner may settle work.
3. Delivery state transitions and dispatch must not overwrite a consumer's newer
   state. Ownership belongs in the repository contract and its atomic adapter,
   not in process-local locks or the queue handler.
4. Outbound URL validation remains a domain-safe policy. DNS resolution,
   connection pinning, redirects, deadlines and response bounds belong in an
   infrastructure transport. No webhook secrets or payloads enter logs.
5. Import rules judge resolved paths and actual dependency direction. Tests must
   demonstrate forbidden paths fail as well as legitimate composition passing.

## Planned workstreams

### A. Scan lifecycle and retry handoff

- [x] Correct transient versus terminal outcome reporting.
- [x] Make terminal outcome reporting safe on redelivery.
- [x] Preserve successful ingestion state when downstream reporting fails.
- [x] Replace destructive retry drain with an explicit acknowledged/leased
      delivery or atomic handoff, after reviewing the smallest compatible design.
- [x] Fix cursor semantics in both scan-job repositories.
- [x] Add integrated failure→retry→success, redelivery, page traversal,
      concurrent drain and shutdown regression tests.

### B. Delivery concurrency and recovery

- [x] Document and implement the narrow atomic repository operations needed for
      dispatch and send ownership; do not widen the existing generic save method.
- [x] Ensure dispatch cannot publish work and subsequently overwrite newer state.
- [x] Fence concurrent senders and stale completion.
- [x] Recover provider exceptions and expired ownership with explicit
      at-least-once semantics. Do not promise exactly-once external delivery.
- [x] Keep in-memory and Prisma contracts equivalent, including tenant/workspace
      scope; review additive migrations if required.
- [x] Prove immediate-consumer, simultaneous-sender, thrown-provider, stale-owner
      and replay behavior.

### C. Egress and runtime safety

- [x] Close shared URL-policy gaps with focused address-range tests.
- [x] Guard webhook connection targets, redirects, total deadline and response
      size through a reusable infrastructure boundary.
- [x] Preserve injected transport testability and webhook signing behavior.
- [x] Contain queue-drain/settlement failures at runtime tick boundaries, retaining
      useful diagnostics and future ticks.
- [x] Validate channel-generation settlement if the suspected reconnect issue is
      confirmed.

### D. Executable architectural boundaries

- [x] Resolve import targets before applying domain/application/adapter rules.
- [x] Cover all configured bounded-context aliases in dependency-cycle checks.
- [x] Add negative fixture tests for the demonstrated bypasses without weakening
      existing checks.
- [x] Run the strengthened gate against the whole repository and fix genuine
      violations in scope; explain any additional work instead of adding blanket
      exclusions.

### E. Atomic interest creation

- [x] Replace the three independent interest/event/idempotency writes with one
      required application-owned creation capability; retain current REST shapes.
- [x] Recheck the scoped receipt, name and workspace capacity inside the same
      Serializable transaction as all writes. Retry the whole transaction.
- [x] Make the first committed idempotency result immutable, including concurrent
      requests with the same key and different names.
- [x] Give in-memory repositories, outbox and receipts one shared backing state
      and publish the creation together, without asynchronous partial visibility.
- [x] Prove rollback on event and receipt failures, concurrent duplicate keys and
      names, the last capacity slot, tenant/workspace isolation, and replay.

### F. Restore deterministic smoke-fixture composition

Final verification exposed pre-existing fixture drift: non-UUID queue scopes,
hourly freshness for a daily-only provider, an incomplete GitHub daily board,
and absent promotion metric-authority/reviewer capabilities. The unchanged
production quality gates correctly reject this input.

- [x] Use stable UUID tenant/workspace fixtures in the MVP loop and verify it.
- [x] Build the complete canonical GitHub board before ingestion, and derive its
      publication projection from the actual persisted fixture source/feed rows.
- [x] Supply canonical native metrics before ingestion. Derive fixture promotion
      authority through the existing domain helper, scoped persisted joins,
      exact metric hashes and observation cutoffs; never force admission.
- [x] Bind a deterministic fixture reviewer through the existing wire/evidence
      contract. Unknown or mismatched input must remain unavailable. Do not use
      attested-binding bypasses or change production defaults/quality gates.
- [x] Preserve completed-summary, top-read and replay assertions. Independently
      review the fixture adapters, rerun both loops, and update evidence only
      after every assertion passes. State that fixture authority/review proves
      orchestration, not real engagement durability or model quality.

## Review and verification

Each workstream receives a focused regression test and an independent critique.
Before implementation of a complex storage or transport change, record the
chosen contract and its failure semantics below. Push finished commits as they
become available; keep this PR in draft while work or material checks remain.

Required common gates: TypeScript compilation, architecture, code quality, source
line caps, changed-file lint and `git diff --check`. Run relevant integration/E2E
and repository/queue checks, plus runtime-profile, security/dependency or public
contract gates when the changed surface requires them. Database concurrency
claims require a real isolated PostgreSQL check if the environment can provide
it; mocks alone are not database evidence.

No production deployment, provider calls, messages to real recipients or real
user project smoke flows are needed. This request authorizes draft PRs and code
pushes; it does not request merging or deployment.

## Decisions, evidence and remaining risks

Implementation decisions, validation results and independent review corrections
are recorded below as each slice completes. A green unit suite is not evidence of live
provider readiness, production migration safety or system-wide exactly-once
processing.

### Design review before implementation

- **Scan retry ownership:** extend the existing retry row with nullable claim
  token/expiry fields. Claim by scoped compare-and-set; acknowledge, release or
  dead-letter only with the matching token. Expired ownership becomes eligible
  again. Keep the same contract in memory. Review claim duration against scan
  execution deadlines and the existing execution lease so slow work is not lost.
- **Delivery dispatch:** an application-owned operation atomically moves a
  dispatchable attempt to `assembling` and appends the existing command-outbox
  envelope in one Serializable transaction. Broker publication is the relay's
  responsibility; it cannot be followed by a stale aggregate save.
- **Delivery execution:** claim and finish using a tenant/workspace-scoped token
  and expiry. External calls stay outside transactions. Expired claims are
  recoverable, completed delivery replays are harmless, and stale completion is
  rejected. Lease duration must account for provider deadlines. Stable outbound
  idempotency keys mitigate unavoidable at-least-once recovery.
- **RabbitMQ generation ownership:** confirmation and delivery settlement must
  stay attached to the channel that performed the operation. A new channel must
  never confirm or acknowledge an older channel's work. The implementation must
  prove concurrent publishers cannot consume each other's confirmation result.
- **Webhook transport:** signed POSTs never follow redirects. Reuse a platform
  infrastructure DNS/address guard for socket lookup and peer verification, and
  keep webhook policy separate from content GET policy. Requests share one total
  deadline, use no pooled socket that bypasses lookup, and consume no response
  body because delivery only needs status and a request-id header. The pure URL
  policy rejects local/private literal addresses, non-unicast IPv6 and URL userinfo.

### Interest creation: additional design review before implementation

The reproduced missing-event failure is included as a narrow final vertical slice.
Introduce a required application-owned creation commit capability accepting a
prepared domain interest/event, scoped receipt identity and explicit capacity
bound. The use case continues to own domain construction, injected IDs and time;
the storage adapter owns atomicity. No generic unit-of-work framework, schema
migration, public DTO change or optional sequential fallback is needed.

Prisma already stores interests, outbox events and idempotency receipts on the
same connection. A Serializable transaction must recheck the scoped receipt,
active/archived name and active interest count before writing. If reserving the
unique receipt first, domain rejection must abort the transaction so an empty
reservation never commits. Existing completed receipts are immutable first-key
wins; an existing active name yields a receipt with `created: false`, without
another event. Keep generated IDs/time stable across internal transaction retry.

Concurrent unique-name conflicts require a narrow fresh transaction/read decision;
do not reinterpret an arbitrary Prisma uniqueness error as success. An archived
name remains occupied by the database unique key and returns a typed conflict,
without resurrection. Use exact-case name matching in both adapters, matching the
existing durable unique constraint; this deliberately corrects the in-memory
adapter's previous case-insensitive mismatch. Capacity is counted atomically,
without relying on paginated list limits. The process-local implementation shares
the existing repositories' backing data and commits synchronously after validating
all mutations, with no await between partial effects.

An independent critic must review rollback, receipt reservation, concurrency and
adapter parity. Real PostgreSQL tests must cover event/receipt-write rollback,
same-key/different-name contention, same-name/different-key contention, capacity
races, scope, archive/case semantics and replay after a completed commit. Historical
missing events/receipts are not implicitly backfilled by this forward fix.

### Compatible dependency remediation

The required security audit reported 14 affected package records (including
transitive cascades). A separate source review confirmed compatible patches for
body-parser, multer, fast-uri, qs and @hono/node-server. Update only those compatible
ranges/overrides and their lock entries; preserve Nest 11, Jest 30 and all vendored
runtime archives and provenance. In particular, Express JSON body parsing occurs
before route authorization, so the body-parser security fix belongs in this batch.

Root Zod is already part of PR #587. The bundled MiMo runtime pins a vulnerable
Zod release and requires an upstream rebuild with valid provenance; rewriting its
archive or claiming an npm override changed bundled code is not an acceptable
fix. The development-only deepmerge advisory has no verified patched release;
the audit's proposed Jest downgrade is rejected. Record remaining advisories
honestly after the compatible updates.

### Deployment and rollback constraints

The three additive migrations require a coordinated worker transition:

1. Pause new scan/delivery dispatch and drain or stop old ingestion retry
   consumers, delivery dispatch/send workers and command-outbox publication.
   Preserve queued messages and pending outbox rows.
2. Apply `20261030155900_scan_attempt_terminal_failure`,
   `20261030160000_scan_retry_delivery_claims`, then
   `20261030160100_delivery_dispatch_execution_claims`.
3. Deploy the compatible workers and regenerated Prisma client. Upgrade the event
   relay before resuming durable delivery dispatch: it now routes delivery
   commands using delivery's exchange/queue/dead-letter settings.
4. Drain old create-interest API writers before asserting first-key-wins across
   replicas; the former writer can still overwrite receipts outside the new
   transaction. Resume dispatch and recovery after old consumers have exited. Old retry
   drainers delete work without honoring claims; old delivery workers ignore
   execution tokens and command generations. Mixed generations are unsupported.

There is no automatic downgrade reconciliation. Leave the additive schema in
place if reverting application code. Stop new claim owners and command relay,
then reconcile outstanding delivery commands and `assembling`/`sending` attempts
before resuming older binaries. The migrations use ordinary `ALTER TABLE` and
`CREATE INDEX`; local verification does not establish lock duration or index-build
cost on production-sized tables, so this is not a zero-downtime deployment claim.

Existing monitoring jobs incorrectly marked failed by the old transient-failure
path are not automatically repaired, and deleted retry rows cannot be recovered
by adding claim columns. Historical terminal outcomes, missing interest events
and receipt inconsistencies require a separate evidence-backed reconciliation.

### Database evidence boundaries

Local native verification uses an isolated PostgreSQL 17 database materialized
from the original baseline Prisma schema, followed by the same three additive
DDL changes. Actual Prisma tests exercise transactions, contention, expiry,
renewal and stale-token rejection. This is not a full historical migration replay
or production RLS proof. The full local historical replay was blocked by an
absent protected role required by existing reader-publication migrations; those
migrations and role controls were not weakened.

CI adds reliability contract checks to the existing PostgreSQL 18 job in a
separate disposable database. Its `prisma db push` establishes the current schema;
it does not run migration SQL or install migration-only checks such as
`scan_retry_claim_pair`. The preceding existing historical-migration/RLS proof
remains unchanged. Report native local checks and remote CI results separately.

The first remote historical replay exposed a missing owner-role switch in the
three new migrations (`42501: must be owner of table scan_attempts`). The new
migrations now follow the existing Serializable `BEGIN` / `SET LOCAL ROLE
social_monitor_public_schema_owner` / `COMMIT` convention; no historical SQL,
grants or RLS controls changed. A separate baseline-schema fixture proved all
three corrected SQL files under a non-superuser, `NOINHERIT`, non-BYPASSRLS login
with only the existing explicit SET-role capability. Unauthorized direct ALTER
failed before and after; session role reset after every commit; both indexes and
the claim-pair constraint were installed. Production still requires the existing
role bootstrap. As with the established explicit-transaction migration pattern,
failure recovery must account for an aborted transaction before interpreting
Prisma's migration-log state.

Remote static checks also caught an omitted readiness declaration for the
delivery worker's newly injected in-memory attempt repository. The declaration
now includes that adapter and the delivery workflow provider source; the gate
itself is unchanged.


## Implemented outcomes

| Boundary | Completed behavior |
| --- | --- |
| Scan execution → monitoring | Attempts and jobs have separate lifecycles. Only terminal failure ends the job; scoped compare-and-set accepts same-outcome replay and rejects conflicting terminal writes. Successful persisted ingestion survives reporting failure, and redelivery repairs reporting without refetching. |
| Durable scan retries | Claim token and expiry replace destructive draining. Acknowledge, release, renew and dead-letter require current ownership. Waiting batch entries renew too; shutdown and partial-drain failures release acquired primary/retry work. |
| Delivery dispatch | `DeliveryAttemptDispatchStore` atomically commits `assembling` and the existing command-outbox envelope. The relay selects delivery's queue configuration, and the in-memory path uses the same outbox-dispatch contract. |
| Delivery execution | A separate execution capability owns claim, renewal, start and settlement. Recovery handles expired ownership and thrown providers; command generation prevents a delayed message from spending another retry. Provider calls remain outside transactions. |
| RabbitMQ | Required `publishAndConfirm` keeps publication, mandatory returns and confirms on the originating channel. Settlement retains the message's original channel. Reconnect, cancellation and backpressure cannot silently confirm or acknowledge a different operation. |
| HTTP egress | Pure URL policy and a shared socket DNS/peer guard cover literal and resolved targets. Signed webhook requests require HTTPS, reject redirects, wait for TLS/peer validation, share a bounded deadline and discard the response at headers. Content GET retains its own redirect/decompression policy. |
| Interest creation | A required application capability commits interest, creation event and immutable scoped receipt together. Serializable name/capacity checks, explicit conflict semantics and synchronous memory publication preserve adapter parity. |
| Architectural enforcement | Resolved paths, actual tsconfig aliases, dotted filenames, dynamic imports/re-exports and all context cycles are checked. Narrow summary/feed contracts and platform-owned physical database client types remove concrete boundary leaks. |

These changes implement capability-specific application contracts rather than
adding a generic transaction or repository framework. Domain invariants remain
inward, composition owns adapter selection, and clocks/IDs stay explicit. Shared
DNS policy, write-conflict retry and bounded PostgreSQL factories remove repeated
infrastructure decisions without coupling bounded-context business policy.

### Corrections from independent review and full CI

- Preserve acquired RabbitMQ deliveries when retry claiming or a later drain
  fails, and preserve recoverable scan outcomes when execution-lease cleanup fails.
- Fence terminal monitoring updates atomically instead of relying on read/check/save.
- Retain dispatch generation through explicit direct retry; an older queued
  command cannot trigger another send after that retry fails.
- Retain publication correlation until the original callback even when the
  broker write reports backpressure.
- Abort interest transactions on expected rejection rather than committing an
  empty receipt; distinguish scoped uniqueness races from identity collisions;
  preserve prepared event time and legacy receipt identity.
- Recognize the observed bare Prisma `DriverAdapterError` transaction-conflict
  envelope for SQLSTATE `40001`/`40P01`, while leaving ambiguous outcomes,
  cancellation, arbitrary metadata and unrelated uniqueness failures terminal.
- Align API, historical conversation and Telegram reporting regressions with
  retry-pending versus terminal failure. Telegram reporting repair proves one
  fetch and one durable dead letter across replay, without deferred false success.
- Route native delivery/interest checks through the existing runtime connection
  factory with one `min=0`, `max=2` lease. The existing pool inventory and budget
  tests remain unchanged.
- Bind the autonomous fixture reviewer in the constructor-composition test's
  isolated VM. Assert its exact seventh-argument identity and the empty eighth
  slot while retaining the independent reader's ninth-argument identity. The
  harness still evaluates only the extracted constructor, not a whole check flow.

The compatible dependency refresh also required updating the repository-owned
hoisted-import approval for `fast-uri`. The official 3.1.9 tarball was checked
against the lockfile SHA512; all 47 regular files matched the installed inventory.
The approved inventory is
`0a7bd1192436a9755603dbfde3315911f7d287c4a639c6cc673f940d4a2f5e05`.
Version-correct packages with missing, modified or symlinked code remain rejected.
Vendored archive bytes and provenance files were not modified.

### Deterministic smoke-fixture correction

Both loops now use valid queue scope identities. The autonomous loop ingests a
complete ten-repository canonical GitHub board and eighteen source observations
overall. Its fixture projection readers join the actual saved source/feed rows;
promotion authority uses the existing domain helper after checking scope,
identity, canonical native metrics and observation time. Four curated HN/Reddit
reviews must actually run through the existing request-binding/evidence/headline
contracts. Unknown or mismatched inputs stay unavailable; an omitted optional
request URL follows the production request shape, while a supplied mismatch is
rejected and the persisted source/feed URL join remains mandatory.

Synthetic QueueWatch stories provide coherent supported topic groups. The safe
RSS runbook remains separate from the unchanged injection specimen, and the
fixture's ordinary-summary policy allows ten key points to retain five-provider
citation coverage alongside the expanded board. The intentional GitHub/Reddit
duplicate pair is now asserted by exact member identity. Frontend coverage is
checked against persisted primary promotion identities, while the supplemental
GitHub board independently requires ten unique repositories with matching saved
citations. Completed publication, redaction, replay, delivery and audit assertions
remain active; no production quality gates or defaults changed.

An independent executable proof passed thirty positive/negative checks covering
the real ranker and binder, unknown/mutated reviewer inputs, scoped identity and
metric/time mismatches, cutoff exclusion and bounded GitHub reads. The refreshed
evidence explicitly declares synthetic first-observation authority, curated
review and fixture story provenance. This proves deterministic orchestration,
not live-provider readiness, historical engagement durability or model accuracy.

## Validation record

Local checks use deterministic fixtures and isolated databases, without live
providers or real user-project agent/runtime flows. Test totals below describe
specific completed batches and must not be added together as unique test counts.

| Check | Result |
| --- | --- |
| Whole-project TypeScript (`tsc --noEmit --incremental false`) | Passed, including the atomic-interest changes and subsequent reviewed integration fixes. |
| Production compilation and alias rewrite | Both build stages passed with a temporary output directory; remote backend build and immutable-candidate qualification also passed at the migration-fix checkpoint. |
| Changed TS/MJS ESLint | Passed across 151 changed files and the final six smoke-fixture TypeScript files. |
| Consolidated affected unit/integration batch | 81 suites / 405 tests passed. The last null-receipt parity correction was independently rerun in 2 suites / 17 tests. |
| Entire backend E2E | 76 suites / 149 tests passed. OpenAPI snapshot and generated mobile contract (91 operations) also passed. |
| Architecture | Repository scan and 28 positive/negative fixture tests passed. |
| Common gates | Full code quality, source line cap, review CI, persistence readiness, tenant database guards and secret checks passed. |
| Native PostgreSQL | Scan retry/terminal-outcome, delivery workflow and interest creation checks passed. Delivery/interest were rerun through the two-connection shared factory. |
| Pool and runtime admission contracts | Unchanged pool-budget suite: 78 tests passed. Runtime installation/admission suite: 69 tests passed, including the verified fast-uri update and three tampering regressions. |
| Runtime and targeted fixtures | Runtime-profile guards, RabbitMQ publisher, event relay, webhook provider, scan queue drain, delivery dispatch/drain/replay, source certification, write idempotency, beta scope, cross-process scheduler and fixture-only summary-memory loop passed. |
| Final monitoring loops | MVP and autonomous loops passed. Autonomous evidence was regenerated only after all runtime assertions passed, then validated by a normal byte-for-byte rerun. Independent fixture-adapter proof: 30 checks passed. |
| Constructor composition harness | The final reviewer-binding correction passed all 9 focused tests, changed-file ESLint and independent review. |
| Migration and role evidence | Schema gate passed; exact SQL succeeded under a restricted explicit-SET-role login. Remote PostgreSQL 18 historical migration/RLS and scan/delivery contract steps passed at commit `f5c023b`. |
| Dependency policy gate | Passed using the existing approved Zod/runtime exceptions; three resolved exceptions were removed. |
| Raw `npm audit --audit-level=moderate` | Still exits 1: 8 affected package records (2 high, 0 moderate, 6 low), down from 14 (5 high, 3 moderate, 6 low). |
| Additional baseline gate | Corrected independently in [merged PR #589](https://github.com/777genius/social-monitor/pull/589): all 19 scenarios/21 evidence files and declared commands were cross-checked; its final PR workflow passed. |

Remote checkpoint evidence:
[workflow 41095172652](https://github.com/777genius/social-monitor/actions/runs/41095172652).
It confirmed the corrected PostgreSQL 18 ownership path, full backend E2E,
security/public contracts, static quality, build, Flutter and immutable-candidate
qualification. Its two failing unit shards identified the pool/admission/recovery
fixture issues described above; those were fixed and verified separately. The
latest PR check status remains the source of truth for the final commit; this
historical checkpoint is not a claim that every later commit already has green CI.

The subsequent full [workflow 41101166945](https://github.com/777genius/social-monitor/actions/runs/41101166945)
at `6ae9546` passed PostgreSQL 18, backend E2E, static quality, builds,
security/public contracts, Flutter, production lifecycle fixtures and five unit
shards. Its remaining unit shard found one missing VM fixture binding
(`fixtureReviewer is not defined`); the resulting aggregate failure did not
indicate another production defect. The narrow harness correction above fixes
that reproduced failure. The final commit's CI status remains authoritative.

## Remaining limits and follow-up

- External notification delivery remains at least once. Stable provider
  idempotency keys mitigate acceptance followed by process/acknowledgment loss;
  database fencing cannot make a remote provider and PostgreSQL one transaction.
- A saved scan outcome does not contain all original warning/collection/failure
  metadata. Replay restores outcome and counts; exact telemetry reconstruction
  needs its own persistence contract. Execution lease loss also does not promise
  exactly-once provider work.
- The atomic creation guarantee applies to create-interest, not every monitoring
  write workflow. Existing-name reuse does not invent historical missing events.
  Review other aggregate/event/idempotency boundaries individually before adding
  another narrow capability.
- Root Zod remediation is coordinated with existing PR #587 and must preserve the
  hoisted-import approval. MiMo's bundled Zod needs a valid upstream runtime
  rebuild. The remaining low-severity deepmerge cascade belongs to Jest tooling;
  no unsupported major downgrade or invented patched release was used. Existing
  Zod/runtime exceptions expire on 2026-11-07.
- Broader event-outbox lease/recovery semantics remain a separately scoped design
  question, especially where publication authority and reader recovery already
  impose their own contracts. No blanket retry/lease rewrite was introduced.
- No production-size index-build timing or historical data repair is claimed.
  Follow the coordinated rollout and rollback constraints above.
- The old E2E acceptance traceability markers for Telegram were fixed in
  [merged PR #589](https://github.com/777genius/social-monitor/pull/589).
  The negative case still explicitly rejects private Telegram invitation
  scopes; no validator or mandatory scenario was removed.

## Post-implementation security review (October 30)

A second pass over the signed-webhook socket boundary found that verifying
only its DNS-pinned remote address after `secureConnect` was insufficient:
Node can emit that event with `socket.authorized === false` if TLS certificate
validation was globally disabled. Before sending any signature-bearing bytes,
the client now explicitly sets `rejectUnauthorized: true` on `https.request`,
requires `socket.authorized === true`, and rejects unauthorized peers with a
non-retryable `tls_unverified` policy error. A negative regression fixture
asserts zero signed bytes are sent; the successful fixture asserts explicit
TLS enforcement. See commits `2a48baa` and `0383f47`.

The post-review code requires a new complete GitHub Actions run; the earlier
green workflow on `53f80fa` does not validate the TLS review correction.
External CodeRabbit review was unavailable for this PR due to its 100-file
limit; any external ReviewRouter or Strix result must be assessed separately,
not inferred from the successful unit/E2E checks. The coordinated production
worker drain and migration sequencing remain merge/rollout gates.
