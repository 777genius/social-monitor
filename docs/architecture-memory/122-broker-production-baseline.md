# 122. Broker Production Baseline

## Status

Locked for production baseline.

## Research Anchors

- Apache Kafka broker configs: https://kafka.apache.org/documentation/#brokerconfigs
- Apache Kafka replication design: https://cwiki.apache.org/confluence/display/kafka/kafka+replication
- RabbitMQ production checklist: https://www.rabbitmq.com/docs/production-checklist
- RabbitMQ quorum queues: https://www.rabbitmq.com/docs/quorum-queues

## Decision

Kafka and RabbitMQ must have explicit durability settings by environment. Local/dev may be cheap; production must protect accepted work and events.

## Kafka Baseline

Production defaults:

- replication factor 3 for durable topics;
- `min.insync.replicas=2`;
- producers use `acks=all` for critical events;
- disable unclean leader election for critical topics;
- schema registry compatibility checks before publishing;
- topic retention by event class;
- monitor under-replicated partitions and consumer lag.

Do not treat Kafka replication as backup. It protects availability/durability inside the cluster, not accidental deletion, bad writes or long-term recovery.

## RabbitMQ Baseline

Production defaults:

- quorum queues for critical durable jobs;
- persistent messages for accepted work;
- DLQs for exhausted retries;
- bounded queue length policies where runaway backlog is possible;
- sufficient file descriptors and disk monitoring;
- separate queues for high-cost AI work and normal jobs.

## Placement Rule

Kafka:

- state changes;
- integration events;
- projections;
- replayable streams.

RabbitMQ:

- directed jobs;
- retries/backoff;
- worker concurrency;
- operational task queues.

## Best-Fact Choice

Using both brokers is acceptable only with strict semantics. Kafka is event log; RabbitMQ is work dispatch. Blurring the boundary creates duplicate reliability models.

