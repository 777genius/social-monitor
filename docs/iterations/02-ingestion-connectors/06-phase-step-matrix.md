# Iteration 02 - Phase Step Matrix

## Phase 01 - Connector SDK

### Build Steps

1. Define provider port.
2. Define capability profile.
3. Define provider-neutral query.
4. Define scan context.
5. Define result and warning model.
6. Define cursor model.
7. Define provider error taxonomy.
8. Build fake connector.
9. Build certification tests.
10. Add source registry.

### Dependencies

- Source acquisition taxonomy.
- Platform skeleton.

### Edge Cases

- Capability exists only with auth.
- Provider supports comments but not search.
- Cursor expires or is server-side only.

### Validation

- Fake connector passes certification.
- Provider DTOs stay outside domain.

## Phase 02 - HN/RSS Implementation

### Build Steps

1. Implement HN adapter.
2. Implement HN normalization.
3. Implement RSS adapter.
4. Add ETag/Last-Modified.
5. Add canonical URL normalization.
6. Add feed fixture tests.
7. Add provider health.
8. Add source warnings.

### Dependencies

- Connector SDK.

### Edge Cases

- RSS item has no date.
- RSS item has duplicate guid.
- HN item is deleted/dead.
- Feed content changes under same URL.

### Validation

- Repeated scans do not duplicate items.
- HN/RSS produce same normalized item contract.

## Phase 03 - Scheduler And Jobs

### Build Steps

1. Define scan policy.
2. Add interval validation.
3. Create job scheduler.
4. Add queue publishing.
5. Add worker claiming.
6. Add retry/backoff.
7. Add quota checks.
8. Add pause/resume.
9. Add dead-letter handling.

### Dependencies

- Local brokers.
- Source bindings.

### Edge Cases

- Two workers claim same job.
- Tenant quota expires mid-scan.
- Source disabled while job is queued.

### Validation

- Job execution is idempotent.
- Status transitions are correct.

## Phase 04 - Feed Dedupe Read Model

### Build Steps

1. Persist raw provider metadata.
2. Persist normalized items.
3. Add dedupe by provider id.
4. Add dedupe by canonical URL.
5. Add content hash.
6. Build topic feed read model.
7. Add stable pagination.
8. Add item detail endpoint.

### Dependencies

- Completed scans.

### Edge Cases

- Same URL from multiple sources.
- Tracking params create false duplicates.
- Item updates after ingestion.

### Validation

- Feed is tenant-scoped, paginated and provenance-rich.

