# 190. Maintenance Jobs Policy

## Status

Locked for operations baseline.

## Research Anchors

- Kubernetes CronJob: https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/
- PostgreSQL routine vacuuming: https://www.postgresql.org/docs/current/routine-vacuuming.html
- PostgreSQL VACUUM: https://www.postgresql.org/docs/current/sql-vacuum.html

## Decision

Maintenance jobs are first-class operational workloads with ownership, idempotency, tenant scoping and concurrency policy.

## Job Classes

| Job | Purpose |
|---|---|
| retention reaper | delete/expire old data by policy |
| deletion verifier | prove privacy deletion completion |
| projection reconciler | detect and repair read-model drift |
| source policy reviewer reminder | flag overdue source policy metadata |
| credential validator | detect expired/revoked source credentials |
| quota reset | rotate plan/source counters |
| analytics export | move safe aggregates to warehouse/lake |
| database maintenance monitor | watch bloat/autovacuum/statistics issues |

## Rules

- Use `concurrencyPolicy: Forbid` unless overlap is explicitly safe.
- Jobs are idempotent and checkpointed.
- Long jobs process bounded batches.
- Each job emits start/end/failure metrics.
- Tenant-impacting jobs write audit or operational events.
- Manual re-run path is documented.

## Database Maintenance

Postgres autovacuum should remain enabled. Manual `VACUUM`/`ANALYZE`/reindex operations require runbook and maintenance window when they can affect performance.

## Best-Fact Choice

Recurring jobs can corrupt or overload production if treated as simple cron scripts. They need the same engineering discipline as API and workers.

