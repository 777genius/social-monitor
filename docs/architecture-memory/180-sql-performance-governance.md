# 180. SQL Performance Governance

## Status

Locked for database performance baseline.

## Research Anchors

- PostgreSQL EXPLAIN: https://www.postgresql.org/docs/current/using-explain.html
- PostgreSQL pg_stat_statements: https://www.postgresql.org/docs/current/pgstatstatements.html

## Decision

SQL performance is governed through query review, observable budgets and production feedback from `pg_stat_statements`.

## Query Review

Require review for:

- feed/search queries;
- cross-tenant/admin queries;
- background batch jobs;
- projection rebuilds;
- deletion/export jobs;
- any query over high-volume tables.

Review includes:

- expected cardinality;
- indexes used;
- tenant filter;
- pagination strategy;
- timeout/batch size;
- `EXPLAIN` plan for representative data.

## Production Monitoring

Enable/collect:

- slow query logs;
- `pg_stat_statements`;
- connection pool wait time;
- lock/blocking metrics;
- table/index bloat indicators;
- sequential scan anomalies on large tables.

## Rules

- Every high-volume query must include tenant scope where applicable.
- No unbounded export/backfill queries.
- Batch jobs use bounded chunks and progress cursors.
- Indexes need ownership and removal review; unused indexes cost writes/storage.

## Best-Fact Choice

Postgres performance problems are usually query/data-shape problems before hardware problems. Build query review into feature delivery.

