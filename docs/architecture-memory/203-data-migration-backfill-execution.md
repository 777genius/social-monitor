# 203. Data Migration and Backfill Execution

## Status

Locked for database/data operations baseline.

## Research Anchors

- PostgreSQL transaction isolation: https://www.postgresql.org/docs/current/transaction-iso.html
- PostgreSQL routine vacuuming: https://www.postgresql.org/docs/current/routine-vacuuming.html
- Kubernetes CronJob: https://kubernetes.io/docs/concepts/workloads/controllers/cron-jobs/

## Decision

Data backfills are controlled jobs with pause/resume, bounded batches, progress tracking and validation. They are not one-off scripts against production.

## Backfill Record

Each backfill stores:

- id;
- owner;
- purpose;
- target table/artifact;
- tenant scope;
- batch size;
- cursor/progress;
- started/finished timestamps;
- dry-run result;
- validation checks;
- rollback/repair note.

## Execution Rules

- Run in bounded batches.
- Use stable cursor ordering.
- Avoid long transactions.
- Respect tenant and DB load.
- Pause automatically on elevated error rate or DB pressure.
- Emit progress metrics.
- Validate counts/checksums/sample records.

## Deployment Sequence

For schema/data changes:

1. Add schema safely.
2. Deploy dual-write/compatible code if needed.
3. Backfill bounded data.
4. Validate.
5. Switch reads.
6. Remove old path in later release.

## Best-Fact Choice

Backfills are production workloads. Treating them as migration footnotes is how systems get locked, overloaded or silently corrupted.

