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

- [ ] Correct transient versus terminal outcome reporting.
- [ ] Make terminal outcome reporting safe on redelivery.
- [ ] Preserve successful ingestion state when downstream reporting fails.
- [ ] Replace destructive retry drain with an explicit acknowledged/leased
      delivery or atomic handoff, after reviewing the smallest compatible design.
- [ ] Fix cursor semantics in both scan-job repositories.
- [ ] Add integrated failure→retry→success, redelivery, page traversal,
      concurrent drain and shutdown regression tests.

### B. Delivery concurrency and recovery

- [ ] Document and implement the narrow atomic repository operations needed for
      dispatch and send ownership; do not widen the existing generic save method.
- [ ] Ensure dispatch cannot publish work and subsequently overwrite newer state.
- [ ] Fence concurrent senders and stale completion.
- [ ] Recover provider exceptions and expired ownership with explicit
      at-least-once semantics. Do not promise exactly-once external delivery.
- [ ] Keep in-memory and Prisma contracts equivalent, including tenant/workspace
      scope; review additive migrations if required.
- [ ] Prove immediate-consumer, simultaneous-sender, thrown-provider, stale-owner
      and replay behavior.

### C. Egress and runtime safety

- [ ] Close shared URL-policy gaps with focused address-range tests.
- [ ] Guard webhook connection targets, redirects, total deadline and response
      size through a reusable infrastructure boundary.
- [ ] Preserve injected transport testability and webhook signing behavior.
- [ ] Contain queue-drain/settlement failures at runtime tick boundaries, retaining
      useful diagnostics and future ticks.
- [ ] Validate channel-generation settlement if the suspected reconnect issue is
      confirmed.

### D. Executable architectural boundaries

- [ ] Resolve import targets before applying domain/application/adapter rules.
- [ ] Cover all configured bounded-context aliases in dependency-cycle checks.
- [ ] Add negative fixture tests for the demonstrated bypasses without weakening
      existing checks.
- [ ] Run the strengthened gate against the whole repository and fix genuine
      violations in scope; explain any additional work instead of adding blanket
      exclusions.

### E. Atomic interest creation

- [ ] Replace the three independent interest/event/idempotency writes with one
      required application-owned creation capability; retain current REST shapes.
- [ ] Recheck the scoped receipt, name and workspace capacity inside the same
      Serializable transaction as all writes. Retry the whole transaction.
- [ ] Make the first committed idempotency result immutable, including concurrent
      requests with the same key and different names.
- [ ] Give in-memory repositories, outbox and receipts one shared backing state
      and publish the creation together, without asynchronous partial visibility.
- [ ] Prove rollback on event and receipt failures, concurrent duplicate keys and
      names, the last capacity slot, tenant/workspace isolation, and replay.

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

Implementation decisions, exact commands/results and review corrections will be
recorded here as each slice completes. A green unit suite is not evidence of live
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
  policy rejects local/non-global literal addresses and URL userinfo.

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
4. Resume dispatch and recovery after old consumers have exited. Old retry
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
from the original baseline Prisma schema, followed by the exact three new SQL
migrations. Actual Prisma tests exercise transactions, contention, expiry,
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
