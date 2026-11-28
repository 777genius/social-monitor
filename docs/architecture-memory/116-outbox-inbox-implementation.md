# 116. Outbox and Inbox Implementation

## Status

MVP foundation, updated for the bounded recovery implementation in PR #801. The platform layer contains executable ports/adapters for:

- polling outbox dispatch through `OutboxDispatcher`;
- atomic leased EVENT claims, retry/backoff and fenced published/failed transitions through `PrismaOutboxStoreAdapter`;
- RabbitMQ event publication through `RabbitMqEventPublisher`;
- a dedicated `event-relay` worker app started with `npm run start:event-relay`;
- durable Prisma inbox processed-event dedupe through `PrismaInboxStoreAdapter`;
- deterministic smoke evidence through `npm run check:event-store`.

## Research Anchors

- Debezium Outbox Event Router: https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
- Debezium outbox pattern article: https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/
- AWS transactional outbox pattern: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html

## Decision

Every service/context that publishes durable domain events writes to an outbox table in the same database transaction as the business state change. Every event consumer records an inbox/processed marker before applying non-idempotent side effects.

## MVP Outbox Table

The current MVP Prisma table is intentionally smaller than the long-term relay table:

```text
id uuid primary key
tenant_id uuid null
workspace_id uuid null
event_type text not null
schema_version int not null
payload json/jsonb not null
status enum(PENDING, PUBLISHED, FAILED)
correlation_id text not null
causation_id text null
created_at timestamptz not null
published_at timestamptz null
message_kind enum(EVENT, COMMAND) not null
available_at timestamptz not null
lease_owner text null
leased_until timestamptz null
publish_attempts int not null default 0
last_error text null
```

`id` is the canonical domain event id. The relay reconstructs the event envelope with `created_at` as `occurredAt`. Event producers write the row at event creation time. Retry, availability and lease columns already exist; the current implementation reuses them without adding a schema migration.

## Long-Term Outbox Table

Target columns:

```text
id uuid primary key
aggregate_type text not null
aggregate_id text not null
event_type text not null
event_version int not null
payload jsonb not null
headers jsonb not null
partition_key text not null
trace_id text null
occurred_at timestamptz not null
available_at timestamptz not null default now()
published_at timestamptz null
publish_attempts int not null default 0
last_error text null
```

`partition_key` is usually tenant id or aggregate id depending on ordering needs.

## Relay

The implementation uses `OutboxDispatcher` against `OutboxStorePort` and `EventPublisherPort`. The Prisma adapter atomically claims due PENDING EVENT rows with `FOR UPDATE SKIP LOCKED`, ordered by availability, creation time and ID. A live database-time owner is required to record each dispatch start and settle its result. Success becomes PUBLISHED; publication failures retry with bounded exponential backoff and become FAILED only when the recorded-start budget is exhausted. The batch heartbeat protects slow admitted work and later claimed rows.

A broker ACK with failed database settlement stays uncertain and may be delivered again after lease expiry. A row-specific persistence error requires a fresh database proof of remaining claims before healthy siblings proceed. Historical FAILED rows retain the explicit manifest/row-version recovery boundary; see [EVENT recovery operations](../operations/event-outbox-recovery.md).

The executable relay process is `apps/event-relay`. It requires `DATABASE_URL` and `RABBITMQ_URL`, reads from the Prisma outbox, publishes event envelopes to `RABBITMQ_EVENT_EXCHANGE` (default `social-monitor.events`), and can tune `EVENT_RELAY_BATCH_SIZE`, `EVENT_RELAY_INTERVAL_MS` and `EVENT_RELAY_RUN_ON_START`.

The production scan-dispatch path also uses the same durable outbox table with
`message_kind = COMMAND`. Manual and scheduled scan writers atomically persist:

- the `ENQUEUED` scan job;
- the `monitoring.scan.requested` event when the manual request produces one;
- the `ingestion.scan.execute` command intent.

The transaction uses Serializable isolation with P2034/serialization retry and
does not call RabbitMQ. `ScanCommandRelayLoop` claims due commands with a
lease owner and lease deadline, increments the attempt counter, publishes to
the command exchange and then marks the exact owned lease published. Failures
are redacted, retried with bounded exponential backoff and become terminal
after the configured attempt budget. Because publication and the final status
write cannot be one transaction, delivery is at least once; `scanJobId` is the
stable command id and consumers must remain idempotent.

EVENT and COMMAND dispatch remain separate capabilities over the same table. Every claim and mutation filters the message kind; neither path can settle the other kind's work.

Polling relay requirements:

- bounded batch size;
- retry with backoff;
- dead-letter state after max attempts;
- metrics for age, attempts and publish failures;
- safe concurrent relay workers.

## MVP Inbox

The current MVP table:

```text
id uuid primary key
consumer_name text not null
event_id uuid not null
tenant_id uuid null
processed_at timestamptz not null
schema_version int not null
unique (consumer_name, event_id)
```

`PrismaInboxStoreAdapter` persists processed markers and treats duplicate inserts as already processed. This provides restart-stable consumer dedupe for idempotent handlers. Full exactly-once side effects still require handler-level idempotency and, for high concurrency, a claim/processing state or transactional projection updates.

## Long-Term Inbox

Target columns:

```text
consumer_name text not null
event_id uuid not null
event_type text not null
processed_at timestamptz not null
handler_version text not null
result text not null
primary key (consumer_name, event_id)
```

Consumer flow:

1. Start transaction.
2. Insert inbox marker or detect duplicate.
3. Apply projection/side effect.
4. Commit.

## Best-Fact Choice

Transactional outbox solves the database-vs-broker dual-write problem. It does not remove the need for idempotent consumers, replay jobs and reconciliation.

## MVP Guardrail

`npm run check:event-store` must stay in the release script. It proves:

- pending outbox events are dispatched and marked `PUBLISHED`;
- publication failures preserve bounded retry, and exhausted recorded starts become `FAILED`;
- a new inbox adapter instance deduplicates a previously processed event.

`npm run check:event-relay` must stay in the release script. It proves the dedicated relay loop publishes outbox events through the RabbitMQ event publisher and removes them from the pending outbox.

Related queue transport guardrails:

- `npm run check:rabbitmq-queue-publisher` proves command route/metadata and successful broker confirmation even when the local write buffer was full;
- `npm run check:scan-queue-drain-loop` proves scan command reader ack/nack semantics;
- `npm run check:summary-queue-drain-loop` proves summary command reader ack/nack semantics and worker command execution.
