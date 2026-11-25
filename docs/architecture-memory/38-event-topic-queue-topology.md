# Event Topic & Queue Topology

Date: 2026-05-31
Status: baseline event/queue topology memory

## Decision

Kafka topics and RabbitMQ queues are named by bounded context and business purpose, not implementation class names.

Every topic/queue must have:

- owner;
- SLO;
- retry policy;
- DLQ policy;
- idempotency key;
- expected throughput;
- retention policy;
- PII/data classification.

## Kafka Topic Naming

Pattern:

```text
<bounded-context>.<aggregate-or-stream>.<event-family>.v<major>
```

Examples:

```text
subscriptions.topic-events.v1
scheduling.scan-run-events.v1
ingestion.source-item-events.v1
normalization.normalized-item-events.v1
intelligence.cluster-events.v1
summarization.summary-events.v1
delivery.notification-events.v1
compliance.deletion-events.v1
ops.provider-health-events.v1
cost.cost-ledger-events.v1
```

## Kafka Partition Keys

```text
scan-run-events: scan_run_id
source-item-events: source_type + external_id
normalized-item-events: source_item_id
cluster-events: cluster_id
summary-events: summary_job_id
notification-events: notification_id
cost-ledger-events: tenant_id
deletion-events: source_item_id
provider-health-events: source_type + provider_id
```

Avoid:

- keying everything by tenant_id, which can create hot partitions;
- random keys for streams requiring per-aggregate ordering.

## RabbitMQ Queue Naming

Pattern:

```text
<bounded-context>.<task>.<priority>
```

Examples:

```text
ingestion.connector-run.hn.normal
ingestion.connector-run.rss.normal
ingestion.connector-run.reddit.high
ingestion.connector-run.reddit.normal
ingestion.connector-run.x.high
ingestion.connector-run.x.normal
ingestion.connector-run.backfill.low
intelligence.embedding.generate.normal
summarization.summary.generate.fast
summarization.summary.generate.batch
delivery.email.send.normal
delivery.webhook.deliver.normal
compliance.deletion.process.p0
```

## Priority Rule

Compliance queues are P0 and must never be starved by backfill/enrichment.

Backfill queues are always low-priority.

## Locked Decisions

1. Topic/queue names are business-purpose based.
2. Partition keys are designed explicitly.
3. Every topic/queue has owner and operational metadata.
4. Compliance queues outrank all non-compliance work.
5. Backfill work uses low-priority queues.

