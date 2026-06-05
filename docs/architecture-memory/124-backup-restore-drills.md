# 124. Backup and Restore Drills

## Status

Locked for production baseline.

## Research Anchors

- PostgreSQL continuous archiving and PITR: https://www.postgresql.org/docs/current/continuous-archiving.html
- Kubernetes disruptions: https://kubernetes.io/docs/concepts/workloads/pods/disruptions/

## Decision

Backups are not complete until restore is tested. Run scheduled restore drills and record RPO/RTO results.

## Assets

| Asset | Backup/Restore Requirement |
|---|---|
| Postgres | base backups + WAL archiving for PITR |
| object storage | versioning/lifecycle policy and restore procedure |
| schema registry | export/backup schemas and compatibility settings |
| Kafka | retention plus optional topic backup for critical streams |
| RabbitMQ | definitions backup; queues are not long-term storage |
| secrets | external secret manager backup/rotation recovery |
| search indexes | rebuild from canonical data, not primary backup |
| vector indexes | rebuild from embeddings/canonical refs |

## Drill Cadence

- personal MVP: manual restore test before important releases;
- beta: monthly Postgres restore drill;
- production SaaS: monthly restore drill and quarterly disaster recovery exercise.

## Restore Priorities

1. Identity/tenancy and entitlements.
2. Topics/source bindings/scan policies.
3. Normalized feed and summaries.
4. Notifications/delivery state.
5. Search/vector projections rebuilt after canonical restore.

## Best-Fact Choice

Postgres PITR is mandatory for SaaS. Projections can be rebuilt; tenant/product truth cannot be hand-reconstructed after data loss.

