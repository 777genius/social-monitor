# ReaderSummary ready delivery and bounded recovery

## Ownership and decision

This slice consumes `reader_summary.ready` v1 after atomic publication. It does
not change publication identity, summary generation, ranking, subscriptions,
credentials, source collection or historical jobs. Production reconciliation
and the last seven days of real summaries belong to the parent delivery task.

The existing `events.delivery.summary.ready` queue binds exactly
`summary.ready` and `reader_summary.ready` on `social-monitor.events`. A small
dispatcher selects distinct validated handlers. The legacy payload and
`summary.status.changed.v1` projection remain unchanged. Routing-key overrides
other than `summary.ready` now fail closed; wildcard bindings are unsupported.
The publisher still uses mandatory routing and publisher confirms.

ReaderSummary uses the existing durable realtime replay repository:

| Reader scope | Channel | Resource |
| --- | --- | --- |
| workspace | `workspace:<workspaceId>:summary-status` | workspace / workspaceId |
| interest | `interest:<interestId>:summary-status` | interest / interestId |

The additive event type is `reader_summary.status.changed.v1`, protocol 1.
Its payload contains only `readerSummaryId`, `readerSummaryJobId`, `status`,
`scope`, and `period` (cadence, UTC start/end, timezone, periodKey).
Tenant/workspace, correlation, source occurrence time, sequence and replay
cursor are in the existing realtime envelope. Proofs, report content, user and
subscription identifiers are not copied into the projection.

The workspace channel suffix follows the existing interest summary-status
lane. No new auth resource or REST response schema is needed. Both REST
`GET /realtime/events` and WebSocket subscribe/refresh authorize
`realtime_events.read` / `read:delivery_status`, then read by tenant, workspace
and channel. Readiness metadata grants no summary-content access; fetching
ReaderSummary content still requires its existing `read:summaries` boundary.
See `realtime-events.controller.ts`, `realtime-events.gateway.ts`,
`reader-summary-job.controller.ts`, and architecture memory 254.

This is a durable replay/read-model effect. It does not promise a live socket
push across processes, a displayed notification, email, webhook or end-user
receipt. Existing REST resync and socket refresh expose the stored event.

## Durability and diagnostics

`delivery.reader_summary.ready.v1` uses the existing unique inbox identity
`(consumer_name, event_id)`. The inbox id equals its realtime projection id.
The two inserts and channel sequence selection run in one Serializable Prisma
transaction. Serialization/unique races retry the entire transaction. A
committed duplicate compares the original tenant/workspace, resource, payload,
occurrence time and correlation before returning its existing projection.
There is no separate check/side-effect/mark-processed crash window.

Retain this consumer's inbox records and associated projections throughout the
recovery horizon. An inbox whose projection has been removed fails closed;
recovery must never delete the inbox to force a second effect. Other existing
realtime writers keep their current behavior and sequence-conflict protection.

Malformed transport/schema/status/scope/period and scope mismatch are rejected.
Only known types enter the dispatcher. Handler failure follows the existing
queue policy: backpressure requeues, other failures dead-letter; channel loss
leaves unacknowledged deliveries for RabbitMQ redelivery. There is no automatic
historic outbox reset or broad dead-letter replay.

For EVENT outbox rows, `publish_attempts` now counts **durably recorded dispatch
starts**, before invoking the broker publisher. It includes starts interrupted
before a send or confirm; it is not an exact send/receipt count. Earlier
uninstrumented attempts are **unknown for all pre-fix EVENT rows**, including
rows whose existing counter is 0. The fix does not backfill or reset them.
Do not infer zero sends from zero recorded starts. COMMAND attempt semantics
are unchanged. An interrupted start records an explicit unknown outcome and
unknown earlier attempts. Failures retain the shared-redacted, single-line,
500-character-bounded reason in `last_error`; acknowledged success clears it.
A database acknowledgement failure can follow a successful broker send, so
FAILED also requires consumer dedupe before recovery.

## One-shot recovery decision (production execution belongs to parent)

`npm run recover:reader-summary-ready-events -- --manifest <absolute-file>`
defaults to `--dry-run`; `--apply` is explicit. This CLI publishes each reviewed
original envelope once through `RabbitMqEventPublisher`, including mandatory
routing and confirms. It never changes FAILED to PENDING or selects a cohort
by count, time or status. The maximum 17 bounds the exact UUID allowlist only.

The strict v1 JSON manifest has `operationId` (UUID), `deployedSourceSha` (40
lowercase hex), `window` (`startedAt`, `expiresAt`, canonical UTC, at most one
hour), `preconditions` (all true: `relayQuiesced`, `exclusiveOperation`,
`consumerReady`, `bindingsVerified`, `retentionHeld`), and `events` (1–17).
Every event has `eventId`, `tenantId`, `workspaceId`, `createdAt`, `correlationId`,
`causationId` (string or null), `readerSummaryId`, `readerSummaryJobId`,
`messageKind: "EVENT"`, `eventType: "reader_summary.ready"`, `schemaVersion: 1`,
`expectedStatus: "FAILED"`, `payloadSha256`, `reportSha256`, `proofSha256`.
Hashes are SHA-256 over UTF-8 `stablePublicationJson` (recursive sorted keys,
array order preserved), including the entire original payload. The report is
reconstructed from the immutable artifact; proof content is also rehashed.
Do not include credentials or raw report/provider content in the manifest.

Parent supplies explicit `READER_READY_RECOVERY_DATABASE_URL`,
`READER_READY_RECOVERY_RABBITMQ_URL` (apply only),
`READER_READY_RECOVERY_DEPLOYED_SHA`, and
`READER_READY_RECOVERY_MANIFEST_SHA256` (SHA-256 of the exact reviewed file bytes).
There is no ambient DATABASE_URL fallback. The source SHA and time-bounded
quiescence attestation are checked again before every effect. These are trusted
parent attestations, not independent deployment/broker discovery. Parent must
verify the deployed consumer revision, both exact bindings, enabled Prisma
drain loop and DLX, hold relay/other recovery writers and retention quiescent,
and use one durable evidence volume across invocations/hosts. The consumer
continues running. Restoring/moving/deleting claims invalidates this procedure.

Inputs and receipts use the existing Linux descriptor-anchored secure evidence
filesystem: `/var/lib/social-monitor/artifacts`, uid 1000, directories 0700,
files 0400, no symlinks, exclusive creation, file and parent-directory fsync.
Installation validates each opened child and fsyncs its containing directory
before descending, including children observed from concurrent creators or
after mkdir returns EEXIST. Any directory sync failure stops claim installation
before publication. Real-filesystem fault/order tests do not prove power-loss behavior.
The manifest is read once and its exact bytes sealed at
`reader-summary-ready-recovery/<operationId>/claim.json`. An existing claim
always rejects apply, including after a crash before the first send. Permanent
per-event claims also prevent overlapping manifests from republishing. No
claim release, TTL takeover, resume or retry switch is provided. An operator
must review any uncertain operation before designing a subsequent action.
This bounded claim plus exclusive parent window avoids a new table/migration.

All exact rows, publication evidence, consumer inbox and replay identities are
validated before claims/effects. The durable `before.json` records metadata,
full-payload/report/proof digests, sanitized prior error, starts counter and
`historicalAttempts: "unknown"`; report/payload bodies are never logged.
For each event, immutable receipts record `publish_started` (before the DB
start), `confirmed` (only after mandatory broker confirm), `acknowledged`
(only after DB acknowledgement), and `consumed` (committed inbox plus matching
projection). Existing delivered identity is recorded separately; it still
requires a confirmed original-envelope publication before outbox acknowledgement.

The standard outbox adapter owns recorded starts, markPublished and markFailed.
Each update compares the previously read PostgreSQL `xmin` tuple version under
an exact UUID `FOR UPDATE` lock inside a Serializable transaction, then invokes
the standard adapter update. Any concurrent row mutation aborts the transition.
This also protects payload, metadata, diagnostics and lease fields without
comparing microsecond PostgreSQL timestamps to millisecond JavaScript Dates. There is
no reset of counters and no acknowledgement of an altered row. Broker calls
are outside all database write retries. A rejected publish records a sanitized
failure when CAS remains safe; a confirm followed by DB failure stays uncertain.
Any error stops the remaining events. A started receipt with no terminal
receipt is also uncertain, including disk/process loss. Never infer send count
from recorded starts or infer consumption from PUBLISHED/confirmed.

After acknowledgement, at most 20 reads spaced 250 ms apart reconcile the
committed inbox/projection using the same parser/use case and duplicate identity
comparison as the consumer. A timeout or retained mismatch stops the operation
without resending. Dry-run remains available after failures/success/window
expiry: it inspects current states and claims without changing them and reports
whether apply is still eligible. It cannot certify a displayed notification.
Parent retains the production seven-day publication/API/site and consumer
identity evidence; synthetic tests do not establish those production facts.

## Focused executable evidence

`scripts/lib/reader-summary-ready-recovery-{run,guards}.spec.ts` exercise the
one-shot CLI orchestration, original-envelope transport, concurrent claims,
retained mismatches, CAS, delayed consumption, uncertainty and redaction with
synthetic data. Run them with the repository Jest config and `--runInBand`.

Sibling use-case/parser tests, `reader-summary-ready-delivery.spec.ts`, and
`prisma-outbox-store.adapter.spec.ts` cover minimal projections, legacy
compatibility, malformed data, isolation, duplicate/ack replay, and diagnostics.

`npm run check:reader-summary-ready-delivery-postgres` requires
`READER_DELIVERY_TEST_ADMIN_DATABASE_URL` for an explicit local disposable
PostgreSQL test server. It never skips or falls back to in-memory assertions.
It creates a random fresh database and isolated non-bypass runtime/capability
roles, loads the affected table/index definitions from migrations and canonical
RLS functions/policies, and drops its own fixtures afterward. It exercises the
real Prisma adapter, concurrent duplicates/channel races, a fresh connection
after commit, rollback after both writes, RLS/scoped reads and stored diagnostics.
It proves these tables/transactions, not the entire migration chain or deployed
broker. Parent acceptance must still validate deployment and real summary data.

## Recovery lifecycle and cancellation follow-up

A historical artifact may now be `SUPERSEDED` while its job and publication
retain `COMPLETED` or `NO_SIGNAL`. Recovery accepts that lifecycle only with
unchanged exact event IDs, job/artifact links, scope, period, report and v1 proof
hashes. It never changes the publication's semantic status. Changed content,
proof, scope or incompatible job/artifact lifecycle still fails closed.

Recovery uses a dedicated Amqplib channel. Its explicit
`cancelPendingPublishes()` synchronously and permanently inhibits future sends,
including continuations waiting for connect, channel creation or exchange
assertion. The guard runs after awaiting the channel, immediately before the
amqplib publish call. A separate synchronous `beforePublish` check enforces the
parent's exclusive window at that boundary. Neither close nor reconnect clears
cancellation. Shared relay command/event publishers and queue consumers retain
their default reusable close/reconnect behavior when cancellation is unused.

The deadline is the earlier of 15 seconds and the remaining exclusive window.
Expiry inhibits future sends before rejecting the wait and recording uncertainty.
This bounds the confirmation wait; it is **not a hard 15-second wire-delivery
or broker-settlement guarantee**. Bytes already handed to amqplib may arrive
later, and event-loop scheduling can delay timers. A late confirm never resumes
acknowledgement or advances the cohort. Claims stay permanent; there is no
blind resend. Resource close is best effort with a separate five-second wait;
its completion is not evidence of cancellation or absence of a send.

`npm run check:reader-summary-ready-recovery-postgres` extends the reviewed
loopback disposable fixture with native recovery tables, canonical constraints
and immutability triggers. It creates an additional isolated non-bypass recovery
role, uses separate bounded Prisma pools (min 0, max 1), and cleans up only its
new database/roles. It exercises supersession without proof mutation, actual
recovery persistence, microsecond/xmin CAS, competing writers, the real consumer
inbox/projection, retained replay, a database trigger failure after confirmation,
permanent claim retention/no resend, and raw RLS queries. The broker confirm is
synthetic; the database work is native. It does not run the full migration chain.

Parent must supply `READER_DELIVERY_TEST_ADMIN_DATABASE_URL` for a **new test
container**, with the same privileges as the reviewed delivery native gate. Run
from this source workspace with existing generated Prisma client/dependencies,
after the focused source typecheck. Transpile-only here avoids repeating that
typecheck inside the native gate deadline; all runtime assertions still execute:

```sh
mkdir -p .cache/reader-recovery-final/native-tmp
chmod 700 .cache/reader-recovery-final/native-tmp
NODE_ENV=test TMPDIR="$PWD/.cache/reader-recovery-final/native-tmp" \
  TS_NODE_TRANSPILE_ONLY=true TS_NODE_COMPILER_OPTIONS='{"rootDir":"."}' \
  npm run check:reader-summary-ready-recovery-postgres
```

The secure receipt tests also require a private TMPDIR whose ancestors are not
writable by others; shared `/tmp` is deliberately rejected. These test options
never relax the production filesystem policy.

Frozen exact17 auditing runs separately from any apply manifest. Only database
columns receive snake-case to camel-case and native Date conversion; JSONB
report/proof/payload values remain unchanged. Audit artifacts contain identities,
statuses and hashes only. They prove frozen content compatibility, not current
outbox/inbox state, deployment, bindings, exclusive access or any other live
precondition. Parent supplies the chronological exact UUID allowlist. Seventeen
bounds manifest entry count, never a query selection; a new natural publication
may add its own separate event and must not broaden this recovery.
