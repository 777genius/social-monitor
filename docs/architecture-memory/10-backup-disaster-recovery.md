# Backup & Disaster Recovery

Date: 2026-05-31
Status: baseline DR memory

## Decision

PostgreSQL point-in-time recovery is required before production. `pg_dump` alone is not enough.

Required:

- base backups;
- continuous WAL archiving;
- point-in-time recovery;
- restore drills;
- backup integrity checks;
- backup encryption;
- documented RPO/RTO;
- deletion/tombstone replay after restore.

Reference:

- PostgreSQL Continuous Archiving and PITR: https://www.postgresql.org/docs/17/continuous-archiving.html

## RPO/RTO Targets

MVP production:

```text
RPO <= 15 minutes for product DB
RTO <= 4 hours
monthly restore drill
```

Later SaaS:

```text
RPO <= 5 minutes
RTO <= 1 hour for core product
```

## Kubernetes Backup

Use Velero or equivalent for Kubernetes resource/PV disaster recovery, but do not confuse cluster backup with database PITR.

Velero manages backup and restore through Kubernetes custom resources and can back up cluster resources and persistent volumes.

References:

- Velero overview: https://velero.io/docs/v1.18/
- How Velero works: https://velero.io/docs/v1.14/how-velero-works/

## Deletion & Backups

Backups conflict with deletion/privacy unless explicitly designed.

Required:

```text
deletion_events
tombstone ledger
post-restore deletion replay
backup retention policy
raw payload expiry policy
legal hold exception handling
```

Rule:

```text
Restoring from backup must not resurrect data that was deleted/tombstoned for source policy, privacy or tenant deletion reasons.
```

## Disaster Runbooks

Required runbooks:

- Postgres PITR restore;
- failed migration rollback;
- Kafka/RabbitMQ recovery;
- object storage recovery;
- lost connector credential rotation;
- tenant accidental deletion;
- region outage;
- backup integrity failure.

## Locked Decisions

1. PITR is mandatory before production.
2. Backup restore drills are mandatory.
3. Velero-style cluster backup does not replace database PITR.
4. Deletion/tombstone replay after restore is mandatory.
5. Backup retention must be aligned with privacy/source policy.

