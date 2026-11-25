# Iteration 02 - Phase To Ticket Map

| Phase | Ticket Groups | Key Artifacts | Closure Evidence |
| --- | --- | --- | --- |
| 01-connector-sdk | Provider port, capability profile, certification | Connector SDK | Fake provider passes |
| 02-hn-rss-implementation | HN adapter, RSS adapter, fixtures | Provider adapters | HN/RSS normalize items |
| 03-scheduler-and-jobs | Scan policy, jobs, lease, retry, cursor | Scheduler/worker | Repeated scans are idempotent |
| 04-feed-dedupe-read-model | Normalized items, dedupe, feed API | Feed read model | Deduped provenance feed works |

## Ticket Cutting Rule

Each connector ticket must include capability profile, failure taxonomy and certification coverage.

## Traceability Rule

Before a ticket is ready, map it to `08-ticket-breakdown.md`, `11-acceptance-test-plan.md`, `14-traceability-matrix.md` and `59-traceable-evidence-register.md`. If the ticket cannot produce evidence, split or rewrite it.
