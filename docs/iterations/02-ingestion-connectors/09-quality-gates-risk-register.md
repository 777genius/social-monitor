# Iteration 02 - Quality Gates And Risk Register

## Hard Gates

1. `SourceProviderPort` and capability profiles are implemented.
2. Provider certification tests exist.
3. HN adapter passes certification tests.
4. RSS adapter passes certification tests.
5. Scheduler creates due scan jobs.
6. Worker lease prevents duplicate processing.
7. Retry/backoff/dead-letter behavior is visible.
8. Cursor is saved only after durable item write.
9. Feed dedupe works by provider ID, canonical URL and content hash.
10. Source provenance is preserved.

## Architecture Checks

- Provider-specific payloads do not leak into feed domain.
- Connector adapters depend on SDK contracts, not feed internals.
- Scheduler operates through application services and ports.
- Feed read model is tenant-scoped.
- Source risk class is attached to each provider.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Cursor saved too early | Data loss | Save cursor after durable normalized write. |
| Retry duplicates items | Noisy feed and bad summaries | Use idempotency and dedupe keys. |
| Provider returns malformed payload | Worker failure loops | Classify error and dead-letter with context. |
| RSS feeds lack stable IDs | Duplicate items | Fallback to canonical URL and content hash. |
| Source expansion starts too early | Fragile platform | Freeze on HN/RSS until SDK is stable. |

## Edge Cases To Recheck

- Same article appears in HN and RSS.
- Feed item date is missing or malformed.
- Provider cursor expires.
- Tenant quota is exhausted mid-scan.
- Topic is deleted while a scan job is queued.

## Transition Criteria

Move to Iteration 03 only when scheduled HN/RSS scans repeatedly produce deduped, tenant-scoped feed items with source provenance.
