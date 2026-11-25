# Reconciliation & Repair Jobs

Date: 2026-05-31
Status: baseline reconciliation memory

## Decision

Distributed systems need reconciliation jobs. Do not rely only on happy-path events.

Reconciliation repairs drift between:

- DB state;
- Kafka event publication;
- RabbitMQ task outcomes;
- provider/source state;
- object storage;
- search/vector/read models;
- billing/cost ledgers;
- delivery provider events.

## Required Reconciliation Jobs

```text
outbox_stuck_events_reconciler
inbox_stuck_messages_reconciler
connector_run_stuck_reconciler
summary_job_stuck_reconciler
digest_delivery_reconciler
webhook_delivery_reconciler
raw_payload_orphan_reconciler
search_index_reconciler
vector_index_reconciler
cost_ledger_reconciler
provider_usage_reconciler
source_deletion_reconciler
```

## Repair Principles

Repairs must be:

- idempotent;
- tenant-scoped;
- auditable;
- bounded by max rows/runtime/cost;
- dry-run capable;
- safe to retry.

## Drift Detection

Detect:

- stuck in-progress jobs;
- missing raw payload refs;
- source items without normalized rows;
- summaries referencing deleted/tombstoned items;
- cost ledger mismatches;
- delivered webhooks without provider confirmation where applicable;
- index/read-model lag beyond SLO.

## Admin UX

Admin console should show:

- detected drift;
- recommended repair;
- dry-run impact;
- repair history;
- rollback/compensation if possible.

## Locked Decisions

1. Reconciliation jobs are first-class production components.
2. Repair jobs are idempotent and auditable.
3. Repair jobs support dry-run where practical.
4. Derived indexes/read models must be reconcilable.
5. Cost/provider usage drift must be detectable.

