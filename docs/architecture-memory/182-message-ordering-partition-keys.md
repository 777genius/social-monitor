# 182. Message Ordering and Partition Keys

## Status

Locked for async architecture baseline.

## Research Anchors

- Kafka design/ordering: https://kafka.apache.org/documentation/#design
- Kafka protocol partitioning: https://kafka.apache.org/protocol/
- RabbitMQ queues and ordering: https://www.rabbitmq.com/docs/queues

## Decision

Ordering is guaranteed only where explicitly designed. Kafka gives order within a partition; RabbitMQ queue ordering can be affected by priorities, requeueing and multiple consumers.

## Kafka Partition Keys

Use partition keys by ordering need:

| Event family | Partition key |
|---|---|
| tenant lifecycle | `tenant_id` |
| topic/source binding changes | `tenant_id` or `topic_id` |
| normalized item events | `tenant_id` + `source_kind` + `source_item_id` hash where needed |
| scan run events | `source_binding_id` |
| summary/digest events | `tenant_id` or `digest_id` |

Do not use random keys for events that need per-aggregate ordering.

## RabbitMQ Ordering

Do not assume strict ordering when:

- multiple consumers share a queue;
- retries/requeues occur;
- priorities are enabled;
- DLQ/retry exchanges reinsert messages later.

If ordered work is required, use per-aggregate serialization, a single-consumer queue, or Kafka partitioned event processing.

## Sequence Policy

For stateful consumers:

- include aggregate version or sequence where useful;
- ignore stale events;
- make projections idempotent;
- reconcile from canonical state if sequence gaps are detected.

## Best-Fact Choice

Ordering guarantees are expensive and local. Use them only for aggregate correctness, not as a vague global assumption.

