# 235 - Database Observability And Index Tuning

## Decision

Database performance is managed as an operational discipline with query telemetry, index review and migration governance.

Indexes are product infrastructure, not incidental implementation details.

## Sources

- PostgreSQL `pg_stat_statements`: https://www.postgresql.org/docs/current/pgstatstatements.html
- PostgreSQL `EXPLAIN`: https://www.postgresql.org/docs/current/sql-explain.html
- PostgreSQL indexes: https://www.postgresql.org/docs/current/indexes.html
- PostgreSQL routine vacuuming: https://www.postgresql.org/docs/current/routine-vacuuming.html

## Required Extensions

Enable where operationally supported:

- `pg_stat_statements`
- `pgcrypto`
- `uuid-ossp` only if needed; prefer application-generated UUID/ULID where chosen
- `vector` when pgvector is used

`pg_stat_statements` requires preload configuration and must be planned in environment setup.

## Query Review

Weekly/regular review:

- highest total time queries
- highest mean latency queries
- highest call count queries
- queries with growing rows scanned
- lock wait contributors
- temporary file usage

Every recurring slow query needs an owner and decision:

- add/change index
- rewrite query
- change read model
- cache
- accept with reason

## Index Lifecycle

Every non-trivial index has:

- purpose
- owning feature
- expected query
- creation migration
- rollback plan
- observed usage review

Unused indexes are candidates for removal after a safe observation window.

## EXPLAIN Policy

Use `EXPLAIN (ANALYZE, BUFFERS)` in non-production or carefully controlled production diagnostics.

Do not run expensive analyze plans against production hot paths without operational approval.

## Migration Safety

Large index creation must use online/concurrent patterns where supported.

Migrations must identify:

- lock risk
- estimated duration
- rollback
- disk growth
- replication impact
- off-peak execution requirement

## Vacuum And Bloat

Append-heavy and update-heavy tables need vacuum/autovacuum monitoring.

Watch:

- dead tuples
- table bloat
- index bloat
- long-running transactions
- replication lag

## Alert Signals

Alert on:

- connection pool saturation
- lock waits
- replication lag
- disk usage
- transaction age
- slow query rate
- failed migrations
- queue workers causing DB saturation

## Architecture Rule

No new hot query ships without:

- expected access pattern
- tenant filter
- pagination strategy
- index review
- performance test or explicit risk acceptance
