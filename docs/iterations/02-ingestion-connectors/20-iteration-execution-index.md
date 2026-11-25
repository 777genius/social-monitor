# Iteration 02 - Execution Index

## Use This Order

1. Start with `00-iteration-overview.md`.
2. Build `01-connector-sdk.md` before any real provider adapter.
3. Continue with `02-hn-rss-implementation.md`, then `03-scheduler-and-jobs.md`, then `04-feed-dedupe-read-model.md`.
4. Use `10-build-order-checklist.md` to avoid cursor, dedupe and worker-order mistakes.
5. Use `11-acceptance-test-plan.md` for repeated scan, malformed provider and dead-letter scenarios.
6. Use `15-change-control.md` for provider SDK, normalized item or scheduler changes.
7. Use `17-review-checklists.md` for adapter and scheduler review.
8. Close with `13-definition-of-done.md` and `14-traceability-matrix.md`.

## Primary Output

Ingestion is complete when scheduled HN/RSS scans repeatedly produce deduped, tenant-scoped feed items with source provenance.
