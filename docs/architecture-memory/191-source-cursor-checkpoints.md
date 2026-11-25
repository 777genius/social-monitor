# 191. Source Cursor and Checkpoint Design

## Status

Locked for ingestion baseline.

## Research Anchors

- Hacker News official API: https://github.com/HackerNews/API
- Reddit API documentation: https://www.reddit.com/dev/api/
- Kafka design/ordering: https://kafka.apache.org/documentation/#design

## Decision

Source cursors are domain state owned by ingestion/scheduling, not opaque strings hidden inside adapters. Adapters may supply provider-specific cursor tokens, but core stores cursor metadata and commit state.

## Cursor Record

Each source binding stores:

- source kind;
- binding id;
- cursor type;
- provider cursor token where applicable;
- last seen external id/timestamp;
- last successful scan id;
- high-water mark;
- low-water mark for backfills;
- cursor version;
- provider policy version;
- updated timestamp.

## Commit Policy

- Commit cursor only after raw payload metadata and normalized items are durably recorded.
- For batch fetches, store per-item dedupe keys before advancing high-water mark.
- If partial batch fails, retry from last committed cursor and rely on idempotency.
- Backfill cursor is separate from incremental cursor.

## Recovery

On cursor expiration or provider contract change:

- mark binding degraded;
- choose safe lookback window;
- avoid unbounded backfill;
- record user/admin-visible reason;
- emit event for reconciliation.

## Best-Fact Choice

Cursor handling is a reliability feature. Treating cursors as adapter-local details makes replay, audit, backfill and support much harder.

