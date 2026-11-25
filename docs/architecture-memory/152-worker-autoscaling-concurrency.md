# 152. Worker Autoscaling and Concurrency

## Status

Locked for runtime scaling baseline.

## Research Anchors

- Kubernetes Horizontal Pod Autoscaling: https://kubernetes.io/docs/concepts/workloads/autoscaling/
- KEDA scaling deployments: https://keda.sh/docs/latest/concepts/scaling-deployments/
- KEDA Kafka scaler: https://keda.sh/docs/latest/scalers/apache-kafka/
- KEDA RabbitMQ scaler: https://keda.sh/docs/latest/scalers/rabbitmq-queue/

## Decision

Use HPA for CPU/memory/request-driven services and KEDA for queue/event-driven workers. Scaling policy must consider provider quotas and concurrency limits, not only backlog.

## Worker Classes

| Worker | Scale Signal | Hard Limit |
|---|---|---|
| ingestion fetch | RabbitMQ queue depth + provider quota | source quota and tenant fairness |
| normalization | queue depth + CPU | CPU/memory |
| intelligence scoring | queue depth + LLM budget | tenant/model budget |
| summarization | queue depth + latency SLO | LLM budget and concurrency |
| notification delivery | queue depth + destination rate | provider/channel limits |
| projections | Kafka lag | partition count and DB capacity |

## Concurrency Rules

- Each worker type has per-pod concurrency.
- Each tenant/source has global concurrency caps.
- Backfills have separate lower-priority concurrency pools.
- AI workers reserve budget before starting expensive calls.
- Kafka consumers must not scale beyond useful partition/concurrency limits.

## Autoscaling Guardrails

- Do not scale fetch workers so high that provider quotas are exhausted faster.
- Do not scale DB-heavy projections beyond database write capacity.
- Use cooldowns to avoid oscillation.
- Keep minimum replicas for latency-sensitive workers.
- Use queue lag and job age SLOs as scaling signals where possible.

## Best-Fact Choice

Queue depth alone is not enough. Worker autoscaling must combine backlog, latency, quotas, budgets and downstream capacity.

