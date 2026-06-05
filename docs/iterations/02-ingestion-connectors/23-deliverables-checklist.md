# Iteration 02 - Deliverables Checklist

## Required Deliverables

1. `SourceProviderPort`.
2. Capability profile model.
3. Provider error taxonomy.
4. Connector certification tests.
5. Fake provider.
6. HN adapter.
7. RSS adapter.
8. Scheduler.
9. Worker lease.
10. Retry/backoff/dead-letter behavior.
11. Cursor discipline.
12. Normalized item schema.
13. Dedupe service.
14. Feed read model and API.

## Closure Evidence

- HN/RSS repeated scans are idempotent.
- Feed is deduped, tenant-scoped and provenance-rich.
- Provider failures are classified and visible.
