# 139. Partitioning and Archival Strategy

## Status

Locked for data/storage baseline.

## Research Anchors

- PostgreSQL declarative partitioning: https://www.postgresql.org/docs/current/ddl-partitioning.html
- PostgreSQL continuous archiving/PITR: https://www.postgresql.org/docs/current/continuous-archiving.html

## Decision

Do not partition every table early. Partition only high-volume time-series or retention-heavy tables where pruning, deletion or operational maintenance benefits are clear.

## Partition Candidates

Good candidates:

- `scan_run` by month/week;
- `raw_payload_metadata` by ingestion month;
- `normalized_item` by tenant/time once volume requires;
- `audit_event` by time;
- `notification_delivery` by time;
- `job_execution_log` by time.

Usually not early candidates:

- `tenant`;
- `user`;
- `topic`;
- `source_binding`;
- `entitlement`;
- small lookup/config tables.

## Rules

- Partition key must appear in common queries or retention operations.
- Unique constraints must include partition key where Postgres requires.
- Create future partitions ahead of time.
- Monitor partition count and planning overhead.
- Retention deletion should prefer dropping/detaching old partitions when possible.
- Archive before deletion only where policy/plan requires.

## Archive Reads

Archived data is not part of hot feed/search by default. If enterprise long retention is required, expose slower archive search/export paths rather than making hot queries pay the cost.

## Best-Fact Choice

Partitioning is an operational tool, not a default modeling style. Use it for large time/retention tables once query and deletion patterns prove the benefit.

