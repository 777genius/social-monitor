# PostgreSQL Physical Design

Date: 2026-05-31
Status: baseline physical database memory

## Decision

Postgres remains the system of record. Physical design must anticipate append-heavy ingestion and tenant-scoped access.

References:

- PostgreSQL Partitioning: https://www.postgresql.org/docs/17/ddl-partitioning.html
- PostgreSQL Indexes: https://www.postgresql.org/docs/17/indexes.html
- PostgreSQL Partial Indexes: https://www.postgresql.org/docs/18/indexes-partial.html

## Partition Early For Append-Heavy Tables

Partition by time:

```text
source_items by discovered_at monthly
connector_runs by started_at monthly
outbox_events by created_at weekly/monthly
inbox_messages by created_at weekly/monthly
cost_ledger by occurred_at monthly
audit_log by occurred_at monthly
raw_payload_refs by discovered_at monthly
analytics_events by occurred_at monthly
```

## Tenant-Scoped Indexing

Always design indexes for tenant-scoped access:

```text
tenant_id + created_at
tenant_id + topic_id + created_at
tenant_id + source_type + created_at
tenant_id + status + created_at
```

## Source Item Indexes

Required:

```text
unique(source_type, source_instance, external_id) where external_id is not null
unique(external_identity_key)
content_hash
normalized_hash
canonical_url
connector_run_id
cluster_id
```

## Partial Indexes

Use partial indexes for hot subsets:

```text
active source bindings
pending summary jobs
failed retryable connector runs
unprocessed outbox events
active webhook endpoints
```

Do not use partial indexes as a substitute for partitioning.

## Raw Payloads

Do not store large raw payloads in core rows. Store refs and metadata in Postgres; payload bytes go to object storage.

## Migration Safety

Large table changes require:

- expand/contract plan;
- concurrent index strategy where possible;
- backfill batches;
- observability;
- rollback plan.

## Locked Decisions

1. Postgres is system of record.
2. Append-heavy tables are partition-ready.
3. Tenant-scoped access paths are indexed.
4. Large raw payloads are not stored in core rows.
5. Partial indexes optimize hot subsets, not partitioning replacement.

