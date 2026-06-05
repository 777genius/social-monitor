# 116. Outbox and Inbox Implementation

## Status

Locked for implementation blueprint.

## Research Anchors

- Debezium Outbox Event Router: https://debezium.io/documentation/reference/stable/transformations/outbox-event-router.html
- Debezium outbox pattern article: https://debezium.io/blog/2019/02/19/reliable-microservices-data-exchange-with-the-outbox-pattern/
- AWS transactional outbox pattern: https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html

## Decision

Every service/context that publishes durable domain events writes to an outbox table in the same database transaction as the business state change. Every event consumer records an inbox/processed marker before applying non-idempotent side effects.

## Outbox Table

Baseline columns:

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

Initial implementation can use a polling relay with `FOR UPDATE SKIP LOCKED`. Later, Debezium CDC can publish from the outbox table to Kafka without changing domain code.

Polling relay requirements:

- bounded batch size;
- retry with backoff;
- dead-letter state after max attempts;
- metrics for age, attempts and publish failures;
- safe concurrent relay workers.

## Inbox

Baseline columns:

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

