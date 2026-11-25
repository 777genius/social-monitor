# 228 - Kafka/RabbitMQ Decision Matrix

## Decision

Kafka and RabbitMQ are both allowed, but they are not interchangeable.

Kafka is the durable event log and integration stream. RabbitMQ is the operational work queue for jobs, retries and worker backpressure.

## Sources

- Apache Kafka design docs: https://kafka.apache.org/documentation/#design
- Kafka consumer groups: https://kafka.apache.org/documentation/#consumerconfigs
- Kafka exactly-once/idempotent producer design: https://kafka.apache.org/documentation/#semantics
- RabbitMQ consumers: https://www.rabbitmq.com/docs/consumers
- RabbitMQ acknowledgements/confirms: https://www.rabbitmq.com/docs/confirms
- RabbitMQ quorum queues: https://www.rabbitmq.com/docs/quorum-queues

## Use Kafka For

- immutable domain events
- cross-service integration
- replayable event streams
- analytics/warehouse feed
- state-change audit streams
- fan-out to multiple independent consumers
- ordering by partition key

Examples:

```text
source.item.normalized
summary.completed
digest.assembled
tenant.plan.changed
source.credential.health_changed
```

## Use RabbitMQ For

- executable jobs
- delayed/retry work
- per-tenant queue backpressure
- worker pool distribution
- job priority classes
- short-lived task routing
- DLQ-based repair

Examples:

```text
scan.execute
source.fetch_page
summary.generate
webhook.deliver
media.extract_text
digest.send
```

## Do Not Use Kafka For

- simple worker job queues before stream replay is needed
- per-message arbitrary delay scheduling
- RPC request/response
- high-churn temporary queues

## Do Not Use RabbitMQ For

- long-term event history
- analytics replay
- durable source-of-truth event log
- many independent consumers needing complete history

## Delivery Semantics

Assume at-least-once at application boundaries.

Even when Kafka idempotent producers or transactions are used, downstream side effects still need idempotency keys.

No product code may claim global exactly-once delivery.

## RabbitMQ Queue Type

For production durable queues, prefer quorum queues where data safety and high availability matter.

Use classic queues only with an explicit reason, such as compatibility or low-risk transient workloads.

## Ordering

Kafka ordering is per partition key.

RabbitMQ ordering can be affected by requeueing, prefetch, priorities and multiple consumers.

If strict order matters, design for:

- single partition key lane
- single active consumer or sequencing
- idempotent state transition checks

## Operational Metrics

Kafka:

- consumer lag
- rebalance rate
- under-replicated partitions
- produce/consume error rate
- topic throughput

RabbitMQ:

- queue depth
- consumer capacity
- unacked messages
- redelivery rate
- DLQ depth
- publish confirm latency

## Architecture Rule

Events say what happened.

Jobs say what should be done.

Do not blur those two concepts just because both move bytes asynchronously.
