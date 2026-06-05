# 117. Canonical Data Model V1

## Status

Locked for implementation blueprint.

## Research Anchors

- PostgreSQL current documentation: https://www.postgresql.org/docs/current/
- PostgreSQL row security policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

## Decision

Use a canonical relational model for product core and derived stores for search, analytics and vectors.

## Core Entities

| Entity | Owner Context | Notes |
|---|---|---|
| `tenant` | Identity & Tenancy | top-level isolation boundary |
| `user` | Identity & Tenancy | global user identity |
| `membership` | Identity & Tenancy | tenant role and status |
| `plan` | Entitlements & Billing | commercial plan definition |
| `entitlement` | Entitlements & Billing | machine-readable limits/features |
| `topic` | Topic Management | user-defined monitoring subject |
| `topic_rule` | Topic Management | query/filter/summary rule versions |
| `source_binding` | Source Management | topic-to-source configuration |
| `credential_ref` | Source Management | encrypted credential pointer, not raw secret |
| `scan_policy` | Scheduling | interval, priority, backfill policy |
| `scan_run` | Scheduling/Ingestion | one execution attempt |
| `raw_payload` | Ingestion | object storage reference and metadata |
| `normalized_item` | Ingestion | canonical item representation |
| `item_edge` | Ingestion/Feed | parent/comment/repost/reply relationships |
| `content_cluster` | Content Intelligence | dedupe/topic cluster |
| `summary_artifact` | Content Intelligence | generated summary with policy/model metadata |
| `digest` | Notifications | assembled notification payload |
| `notification_delivery` | Notifications | per-channel delivery state |
| `audit_event` | Audit & Compliance | immutable control-plane audit |

## Tenant Isolation

All tenant-owned tables include `tenant_id`. Application authorization remains primary. Postgres RLS may be added for high-risk tables/admin paths, but do not rely on RLS alone as the only authorization layer.

## Identity Rules

- Internal ids use UUID/ULID.
- External source ids are stored as `(source_kind, source_item_id)`.
- Never expose sequential internal ids.
- Unique constraints include tenant/source scope where relevant.

## Best-Fact Choice

Postgres should own product truth. Search indexes, vector stores and warehouses are projections and must be rebuildable from canonical records plus raw/artifact storage where retained.

