# EVENT relay recovery and replica ownership

The EVENT relay claims a bounded due batch from the existing `outbox_events`
table. It preserves event IDs and envelopes. There is no schema migration and no
new background service. COMMAND delivery retains its existing dispatcher.

## State and retry policy

| State | Automatic relay behavior |
| --- | --- |
| PENDING, due, no live owner | Eligible for an atomic bounded claim. |
| PENDING with a live owner | Other relays skip it. |
| PENDING with an expired owner | A new relay may claim it. |
| PENDING with a future available_at | Wait until the durable retry time. |
| PUBLISHED | Terminal; never republished automatically. |
| FAILED | Terminal; only the existing explicitly reviewed recovery workflow may act. |

New EVENT dispatch failures remain PENDING until their retry budget is exhausted.
The dispatcher defaults are a 30-second lease, ten recorded starts, a one-second
initial delay, and exponential delay capped at five minutes. Existing relay
composition keeps its two-second polling default and at most 500 claimed rows.
It reports published, retrying, and failed separately.

Claiming a batch does not increment every row's attempt count. A recorded start
is persisted immediately before the publisher call. If a process stops after
recording a start, its external outcome remains uncertain. Historical sends
before attempt instrumentation are still unknown. A reclaimed row already at
the budget becomes FAILED without another publication.

Lease renewal covers the active row and queued siblings. A failed renewal stops
new publisher calls. Database time is checked after row ownership is locked;
capturing a time before a pool or row-lock wait cannot extend expired authority.
A lease cannot cancel bytes already handed to the network.

## Failure isolation and duplicate effects

A broker ACK followed by a lost settlement write leaves an uncertain leased
PENDING row. A replacement relay can send the same event after expiry. The
production `reader_summary.ready` and `summary.ready` consumers commit their
inbox record and read-model projection in one transaction and validate duplicate
identity and scope. This is at-least-once publication with durable consumer
deduplication.

A publication failure does not prevent healthy siblings from being processed.
An uncertain row is removed from renewal and left to expire. Before continuing
with siblings, the relay requires a fresh successful database renewal of every
remaining claim. This isolates a row-specific storage failure without admitting
work during a database outage or after remaining ownership is lost. The original
error is still raised after safely processed siblings, so the tick cannot hide
the fault or credit uncertain work as published. It does not clear another
owner's lease or rewrite a confirmed terminal row. The next polling tick remains
available after an error.

Stopping the relay drains an admitted publication and prevents starting further
batch items. Unstarted siblings retain their attempt counts and become available
after lease expiry. A shutdown during the startup tick cannot create a new
interval after the loop has stopped.

## Rollout and rollback boundaries

Drain and stop old EVENT relay binaries before starting the new implementation.
An old binary ignores leases, so mixed old/new replicas cannot provide the new
ownership guarantee. After all old relays have stopped, multiple new replicas
may use the same table.

Do not use a data backfill to turn historical FAILED rows into PENDING. Existing
manifest-pinned recovery remains separate through `PrismaEventRecoveryStoreAdapter`
and its reviewed identity/xmin guard and operation receipts. Automatic polling
has no terminal-recovery mode.

For rollback, stop the new relays and let outstanding publications drain before
restoring a single old relay. Old code ignores available_at and lease ownership
and permanently fails transient sends; its behavior is a loss of these new
guarantees. Pending event identity and payloads do not require conversion.

This PR does not deploy or perform a production recovery. No throughput or
production readiness claim follows solely from the fixture checks.

## Executable checks

Focused tests under `libs/platform/events` cover backoff, interrupted starts,
historical terminal records, late acknowledgements, ownership loss, and cleanup.
`apps/event-relay/src/outbox-relay-loop-recovery.spec.ts` runs the real loop,
dispatcher and leased in-memory store through outage/recovery and shutdown.

The existing `check-reader-summary-ready-delivery-postgres.ts` entrypoint now
also runs `scripts/lib/event-outbox-postgres-scenarios.ts`. It uses a fresh
disposable database and separate runtime connections to check concurrent claims,
SKIP LOCKED progress, expiry after a row-lock wait, actual heartbeat renewal,
a row-specific PostgreSQL trigger failure with healthy sibling progress, and
actual transactional consumer deduplication after lost ACK storage. Its
broker faults are injected; native RabbitMQ verification is a separate gate.
