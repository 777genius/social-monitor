# 233 - Read Model And Materialized View Policy

## Decision

Use explicit read models for feed, summary, status and dashboard views.

Materialized views are allowed for expensive read aggregations, but they need refresh ownership, SLOs and unique indexes when refreshed concurrently.

## Sources

- PostgreSQL materialized views: https://www.postgresql.org/docs/current/rules-materializedviews.html
- PostgreSQL `REFRESH MATERIALIZED VIEW`: https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html
- PostgreSQL row security: https://www.postgresql.org/docs/current/ddl-rowsecurity.html

## Read Model Types

Preferred order:

1. Normal indexed tables for canonical read paths.
2. Denormalized projection tables maintained by application events/jobs.
3. Materialized views for expensive aggregate snapshots.
4. External search projections only when required.

## Product Read Models

Required V1/V2 read models:

- tenant topic list
- source binding health list
- normalized feed list
- item detail
- summary list
- summary detail
- digest delivery history
- scan status timeline

## Materialized View Rules

Allowed for:

- admin dashboards
- slow aggregate summaries
- reporting snapshots
- non-interactive analytics

Avoid for:

- high-frequency per-user feed rendering
- write-path invariants
- authorization-critical filtering
- data that must be instantly fresh

## Concurrent Refresh

PostgreSQL requires a suitable unique index for `REFRESH MATERIALIZED VIEW CONCURRENTLY`.

Any materialized view intended for production reads must document:

- refresh method
- refresh owner job
- unique index
- staleness SLO
- failure behavior
- tenant filtering behavior

## Freshness Classes

```text
live        -> read from canonical/projection table
near_live   -> refreshed within seconds/minutes
scheduled   -> refreshed on cron/interval
manual      -> admin-triggered only
```

UI must not present scheduled/manual data as live.

## Event-Driven Projections

For high-value UI paths, prefer projection tables updated by events/jobs:

```text
source.item.normalized -> feed_read_model upsert
summary.completed -> summary_read_model upsert
source.health_changed -> source_status_read_model upsert
```

This avoids full refresh cost for hot views.

## Backfill

Read model rebuild must be possible from canonical tables/events.

Backfill jobs need:

- batch size
- tenant scope
- resume cursor
- progress status
- idempotent upserts

## Architecture Rule

Read models are disposable projections.

Canonical domain state remains in transactional tables and raw payload/object storage according to retention policy.
