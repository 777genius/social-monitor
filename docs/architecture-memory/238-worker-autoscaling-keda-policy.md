# 238 - Worker Autoscaling KEDA Policy

## Decision

Worker autoscaling uses queue depth, consumer lag and provider budget signals, not CPU alone.

Kubernetes HPA handles generic resource scaling. KEDA is used when event-source metrics such as RabbitMQ queue length or Kafka lag should drive replicas.

## Sources

- Kubernetes autoscaling: https://kubernetes.io/docs/concepts/workloads/autoscaling/
- Kubernetes HorizontalPodAutoscaler: https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/
- KEDA scalers: https://keda.sh/docs/latest/scalers/
- KEDA RabbitMQ scaler: https://keda.sh/docs/latest/scalers/rabbitmq-queue/
- KEDA Kafka scaler: https://keda.sh/docs/latest/scalers/apache-kafka/

## Worker Classes

Define independent scaling profiles:

- source scan workers
- source fetch page workers
- normalization workers
- summary generation workers
- webhook delivery workers
- media extraction workers
- backfill/replay workers

Do not use one generic worker deployment for all job types once workloads diverge.

## Scaling Signals

RabbitMQ-backed jobs:

- ready messages
- unacked messages
- oldest message age
- DLQ depth
- consumer capacity

Kafka-backed consumers:

- consumer lag
- partition count
- rebalance rate
- processing latency

AI workers:

- queue depth
- token budget
- provider rate limits
- model availability

## Concurrency Caps

Autoscaling replicas is not enough.

Each worker class also needs:

- max concurrent jobs per pod
- max provider calls per pod
- max DB connections per pod
- max tenant concurrency
- max source binding concurrency

Without caps, scaling can amplify provider rate limits and database saturation.

## Scale-To-Zero

Allowed for:

- low-priority backfill workers
- non-urgent digest workers
- rarely used export workers

Avoid for:

- latency-sensitive realtime status
- queue types where cold start causes SLO misses
- providers with strict connection/session behavior

## Backpressure

Scheduler must check:

- tenant budget
- provider quota
- queue depth
- oldest job age
- worker saturation

If queues are unhealthy, create fewer jobs instead of relying on autoscaling to rescue the system.

## Deployment Safety

Worker rollouts require:

- graceful shutdown
- message ack only after durable side effects
- visibility timeout/lease awareness
- idempotent job handling
- drain behavior for long jobs

## Metrics

Every worker class publishes:

- jobs started/completed/failed
- retry count
- DLQ count
- processing duration
- provider calls
- DB time
- tenant/source labels with cardinality controls

## Architecture Rule

Autoscaling follows demand and budgets.

It must not turn a provider outage or bad query into a larger incident.
