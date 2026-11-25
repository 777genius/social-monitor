# Iteration 02 / Phase 04 - Feed Dedupe Read Model

## Objective

Create normalized feed, dedupe and first read models.

## Steps

1. Define source item canonical schema.
2. Add unique provider id constraints.
3. Add URL/title/time dedupe fallback.
4. Add topic match records.
5. Add feed read model table.
6. Add search vector for title/body.
7. Add REST endpoints for feed list/detail.

## Retention And Tombstone Rules

1. `SourceItem` keeps provider identity, canonical URL, source binding id, observed time and safe provenance while allowed by policy.
2. Raw payload pointer is optional and can be deleted without breaking feed identity.
3. `FeedItem` can be hidden/tombstoned when topic/source is deleted or source policy requires removal.
4. Dedupe links preserve provenance for multiple source observations until retention policy removes them.
5. Summary citations resolve to safe retained provenance or return explicit `citation_unavailable`, not crash.
6. Cross-tenant dedupe is forbidden even when public item identity matches.

## Edge Cases

- Provider changes item text after initial ingest.
- Same story appears with canonical and tracking URLs.
- Item belongs to multiple topics.
- Tenant deletes a source binding.
- Raw payload is deleted while feed item and summary citation remain.
- Source item is tombstoned but dedupe group still has another visible observation.
- Topic deletion happens while feed read model projection is behind.

## Pay Attention

- Dedupe should not collapse unrelated items with same title.
- Feed read model is projection, not truth.
- Retention/deletion state must filter reads.
- Retention jobs must not remove idempotency/provenance needed for citation or support unless policy says so.

## Acceptance Criteria

- Feed endpoint returns paginated items.
- Search works inside tenant.
- Duplicate URLs cluster/merge predictably.
- Cross-tenant item access is impossible.
- Citation-unavailable behavior is tested after raw payload/source item retention changes.
