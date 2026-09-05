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

## Proposed recovery contract (not executed)

There is no canonical scoped EVENT-outbox reset command in this base. Existing
webhook replay and ReaderSummary job recovery are different operations. The
minimal proposed operation is `recover-reader-summary-ready-events --manifest
<reviewed-file> --dry-run`, with a separately authorized `--apply` mode. This
change documents the contract; it does not add a general recovery platform.

The manifest must contain an operation id, approved deployment revision,
operator/reason, exact event UUID allowlist (maximum 17 for the original cohort),
expected tenant/workspace per row, event type/version, creation timestamp,
readerSummary/job ids, report/proof hashes and a canonical payload digest.
The original Aug 30 cohort and the parent's seven-day evidence determine the
actual UUIDs. A time range, status predicate, or the number 17 alone is never an
allowlist. Never mutate publication proof, job, artifact or payload to recover.

Preconditions for apply:

1. The parent verifies the deployed revision, both exact broker bindings,
   mandatory publication, enabled shared drain loop, Prisma persistence and
   DLX settings. Validate the PostgreSQL fixture below, including crash retry.
2. Reconcile every allowlisted event against immutable publication evidence;
   validate through the same reader parser. Record existing consumer inbox and
   realtime projection identities. An inconsistent/missing retained projection
   or altered payload stops the operation for investigation.
3. Quiesce the event relay for the bounded operation. In one Serializable
   transaction, lock only the allowlisted EVENT rows, compare every manifest
   precondition, and require all still have `FAILED` / version 1 /
   `reader_summary.ready`. Abort the entire operation on any mismatch. Record
   immutable before-state audit evidence (including sanitized error, counter
   and explicit `historicalAttempts: unknown`) before any mutation.
4. Change only these rows' status to `PENDING`, retain original diagnostics and
   recorded counters, and atomically append an audit record linking operation
   id, manifest digest, operator, exact ids and before/after state. Use existing
   audit persistence if its contract supports an atomic operation; otherwise a
   narrow maintenance audit entry must be approved before implementing apply.
5. Resume the normal mandatory relay once. Verify publisher confirmation and
   exactly one matching durable projection/inbox per event. Record duplicates,
   fresh projections and failures separately. Stop on failure; never loop a
   reset or assume PUBLISHED means consumed. Rollback is to halt recovery and
   retain evidence, not to erase inbox/projections or rewrite publication.

The parent owns production authorization and these actions. This lane runs no
recovery command, outbox replay, deployment, push, PR or external notification.

## Focused executable evidence

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
