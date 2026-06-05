# 103. Event Catalog V1

## Status

Locked for architecture baseline.

## Research Anchors

- Apache Kafka design and delivery semantics: https://kafka.apache.org/documentation/#design
- CloudEvents specification: https://github.com/cloudevents/spec
- RabbitMQ quorum queues: https://www.rabbitmq.com/docs/quorum-queues
- Confluent Schema Registry compatibility: https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html

## Decision

Create a versioned event catalog before writing producers. Events are product contracts, not logging strings.

## Kafka Domain/Integration Events

| Event | Producer | Consumers |
|---|---|---|
| `tenant.created.v1` | Identity | Entitlements, Audit |
| `topic.created.v1` | Topic Management | Scheduler, Audit |
| `topic.rules_updated.v1` | Topic Management | Scheduler, Intelligence, Audit |
| `source_binding.connected.v1` | Source Management | Scheduler, Audit |
| `source_binding.paused.v1` | Source Management | Scheduler, Notifications |
| `scan.due.v1` | Scheduler | Ingestion |
| `scan.completed.v1` | Ingestion | Scheduler, Feed, Intelligence |
| `item.normalized.v1` | Ingestion | Feed, Dedupe, Intelligence |
| `cluster.updated.v1` | Intelligence | Feed, Notifications |
| `summary.created.v1` | Intelligence | Feed, Notifications |
| `digest.ready.v1` | Notifications | Realtime, Audit |
| `tenant.deleted.v1` | Identity/Compliance | all data-owning contexts |

## RabbitMQ Job Queues

| Queue | Purpose |
|---|---|
| `scan.fetch` | retryable provider fetch job |
| `scan.normalize` | CPU-bound normalization |
| `ai.score` | relevance scoring |
| `ai.summarize` | summary generation |
| `notify.deliver` | email/webhook/push delivery |
| `compliance.delete` | deletion workflow tasks |
| `projection.rebuild` | bounded read-model rebuilds |

Use quorum queues for durable critical jobs. Non-critical transient work may use lighter queues only with explicit loss tolerance.

## Event Rules

- CloudEvents envelope for Kafka events.
- Schema Registry required for all Kafka event data.
- Event ids are globally unique and idempotency keys.
- Consumers store processed event ids or deterministic projection offsets.
- No event contains raw provider payload; use object storage refs.
- No event contains secrets.

## Best-Fact Choice

Kafka is for durable event history and multiple consumers. RabbitMQ is for directed retryable jobs and worker backpressure. Using both is justified only if this separation remains strict.

