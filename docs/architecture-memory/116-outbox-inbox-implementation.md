# 116. Outbox and Inbox Implementation

## Status

Locked for MVP implementation. The platform layer now contains executable ports/adapters for:

- polling outbox dispatch through `OutboxDispatcher`;
- durable Prisma outbox reads and published/failed state transitions through `PrismaOutboxStoreAdapter`;
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
```

`id` is the canonical domain event id. The relay reconstructs the event envelope with `created_at` as `occurredAt`. This is acceptable for the MVP because event producers write the row at event creation time; a later production hardening pass can add explicit `occurred_at`, attempts, `available_at`, `last_error` and row-lock leasing without changing domain code.

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

The MVP implementation uses `OutboxDispatcher` against `OutboxStorePort` and `EventPublisherPort`. The Prisma adapter reads pending events in deterministic `createdAt/id` order, publishes through an injected publisher, marks success as `PUBLISHED` with `publishedAt`, and marks publisher failures as `FAILED`.

The executable relay process is `apps/event-relay`. It requires `DATABASE_URL` and `RABBITMQ_URL`, reads from the Prisma outbox, publishes event envelopes to `RABBITMQ_EVENT_EXCHANGE` (default `social-monitor.events`), and can tune `EVENT_RELAY_BATCH_SIZE`, `EVENT_RELAY_INTERVAL_MS` and `EVENT_RELAY_RUN_ON_START`.

Later hardening should switch the Prisma query to a leasing query with `FOR UPDATE SKIP LOCKED` or move relay publication to Debezium CDC without changing domain use cases.

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
- publisher failures are marked `FAILED`;
- a new inbox adapter instance deduplicates a previously processed event.

`npm run check:event-relay` must stay in the release script. It proves the dedicated relay loop publishes outbox events through the RabbitMQ event publisher and removes them from the pending outbox.

Related queue transport guardrails:

- `npm run check:rabbitmq-queue-publisher` proves command publisher route assertion and RabbitMQ publish metadata;
- `npm run check:scan-queue-drain-loop` proves scan command reader ack/nack semantics;
- `npm run check:summary-queue-drain-loop` proves summary command reader ack/nack semantics and worker command execution.
