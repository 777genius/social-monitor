# Queue delivery ownership

The platform queue contracts describe one acquired delivery, independently of
its command id. Duplicate command ids can represent distinct broker messages.
Workers own handler policy; adapters own acquisition, acknowledgement and
recovery. Delivery is at least once, including after an uncertain acknowledgement.

`QueueDeliveryBatch` keeps every delivery pending until its settlement succeeds.
Settlement starts synchronously so competing acknowledgement, rejection and abort
cleanup cannot settle a delivery twice. Handler errors determine the worker's
existing retry or rejection decision; acknowledgement errors abort the tick and
do not enter that business decision. Final cleanup attempts every pending sibling
and reports failures separately from the primary error.

Concrete deliveries provide an idempotent `release` operation for abort cleanup.
The optional shape permits existing structural test doubles and durable scan
retry claims to use `nack({ requeue: true })`. Retry-claim expiration remains the
ingestion worker's recovery mechanism. In-memory deliveries reserve individual
published occurrences and requeue each occurrence at most once; legacy publisher
`drain` remains destructive for callers that explicitly request that API.

RabbitMQ readers take ownership immediately after `get`, before decoding. Poison
messages count against the bounded read limit and are rejected without requeue.
Acquisition failure releases all earlier unprocessed messages. If rejection or
abort release fails, the concrete channel can recover only the captured native
origin. It never closes or settles through a replacement channel. A confirmed
close, or an observed native close/error, establishes recovery; a rejected close
alone does not mark an open origin closed.

If both release and origin recovery fail, the reader retains the unsettled handle.
The next drain must recover those handles before acquiring new work. Structural
channels without origin recovery retry the original negative acknowledgement.
Cleanup failures therefore cannot become logged-and-forgotten live deliveries.
The retained set is bounded by the failed acquisition/processing batch because
unresolved recovery blocks further acquisition.

The shared command reader validates envelopes and configures durable command
queues. Event readers may reuse the acquisition primitive while keeping their
event schema, routing-key validation and exchange bindings local. Concrete
adapters are exported only from explicit adapter paths; the platform root exports
contracts, diagnostics and batch ownership.
