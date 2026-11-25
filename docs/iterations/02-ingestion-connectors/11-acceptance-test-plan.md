# Iteration 02 - Acceptance Test Plan

## Acceptance Scenarios

1. Fake provider passes connector certification tests.
2. HN adapter produces normalized source items.
3. RSS adapter produces normalized source items with ETag/Last-Modified support.
4. Repeated scan does not duplicate feed items.
5. Same canonical URL from two sources dedupes into one feed item.
6. Worker lease prevents two workers from processing the same job.
7. Retry/backoff handles temporary provider failure.
8. Dead-letter entry contains tenant, source binding, provider error class and correlation ID.
9. Cursor is saved after durable item persistence.
10. Feed API returns tenant-scoped paginated items with provenance.

## Negative Scenarios

1. Malformed RSS feed is classified without crashing worker.
2. Expired provider cursor triggers safe recovery path.
3. Topic deletion while job is queued prevents orphan processing.
4. Tenant quota exhaustion pauses or fails scan with actionable status.

## Regression Checks

- Provider payloads do not leak into feed domain.
- Normalized schema remains stable.
- Dedupe keys remain deterministic.
- Source capability profile remains visible to UI.

## Pass Criteria

Ingestion is accepted when scheduled HN/RSS scans repeatedly produce deduped tenant feed items and all failure modes are visible.
