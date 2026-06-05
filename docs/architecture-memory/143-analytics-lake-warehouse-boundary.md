# 143. Analytics Lake and Warehouse Boundary

## Status

Locked for analytics baseline.

## Research Anchors

- Apache Iceberg documentation: https://iceberg.apache.org/docs/latest/docs/
- BigQuery partitioned tables: https://cloud.google.com/bigquery/docs/partitioned-tables
- Snowflake streams and tasks: https://docs.snowflake.com/user-guide/data-pipelines-intro

## Decision

Operational Postgres is not the analytics warehouse. Product read models may support user features, but long-running analytics, BI and experimentation should move to a separate analytics boundary.

## Phases

MVP:

- Postgres product tables;
- lightweight analytics tables/projections;
- export jobs for usage/cost metrics.

Beta/SaaS:

- event export to object storage;
- warehouse/lakehouse ingestion;
- BI dashboards from analytics store;
- privacy-filtered datasets.

Scale:

- Iceberg/Parquet-style lakehouse or managed warehouse;
- partitioned analytic tables;
- governed data marts by domain.

## Data Boundaries

Do not export by default:

- raw source payloads;
- secrets/credential material;
- private source data;
- raw prompts where they include user/source content.

Export:

- usage counters;
- cost facts;
- source/job metrics;
- anonymized product events;
- summary quality/eval metrics;
- tenant-level aggregates where policy allows.

## Best-Fact Choice

Analytics must not compete with production workloads. Start simple, but keep a clean export path so BI and experimentation do not query operational tables directly forever.

