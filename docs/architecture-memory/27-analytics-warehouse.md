# Analytics Warehouse & BI Separation

Date: 2026-05-31
Status: baseline analytics warehouse memory

## Decision

Do not run heavy product analytics/BI directly on the transactional Postgres database once usage grows.

MVP can query Postgres for simple admin metrics. Production SaaS should separate operational database from analytics workloads.

## MVP

Use:

- Postgres for product truth;
- internal analytics events table;
- cost ledger;
- periodic aggregate read models;
- simple dashboards from operational replicas where safe.

## Later Analytics Stack

Evaluate:

- ClickHouse for high-volume event analytics;
- object storage + Apache Iceberg/Parquet for data lake/lakehouse patterns;
- warehouse export pipeline if business reporting grows.

ClickHouse is designed for real-time analytics and supports materialized views for query acceleration/transformation. Apache Iceberg is an open table format for large analytic datasets.

References:

- ClickHouse docs: https://clickhouse.com/docs/en
- ClickHouse materialized views: https://clickhouse.com/blog/using-materialized-views-in-clickhouse
- Apache Iceberg spec: https://iceberg.apache.org/spec/

## Analytics Events

Product analytics events remain schema-governed:

```text
event_name
event_version
tenant_id
user_id nullable
session_id nullable
entity_refs
properties_json
occurred_at
schema_ref
pii_classification
```

## Separation Rule

Operational decisions use product DB/ledgers:

- entitlement checks;
- budget preflight;
- connector scheduling;
- compliance deletion.

Analytics warehouse is for:

- product insights;
- trend analysis;
- funnel analysis;
- cost/revenue reporting;
- quality dashboards.

## Locked Decisions

1. Transactional Postgres is not long-term BI warehouse.
2. Operational decisions do not depend on warehouse freshness.
3. Analytics events are schema-governed.
4. ClickHouse/Iceberg are later options, not MVP dependencies.
5. Cost/usage ledgers remain operational product data.

