# Iteration 02 - Review Checklists

## Connector Review

1. Adapter implements `SourceProviderPort`.
2. Capability profile is complete.
3. Provider risk class is documented.
4. Provider payload is not leaked into feed domain.
5. Error taxonomy is used consistently.

## Scheduler Review

1. Jobs are tenant-scoped.
2. Worker lease prevents duplicate processing.
3. Retry/backoff is bounded.
4. Dead-letter output is actionable.
5. Cursor is saved after durable item write.

## Feed Review

1. Normalized item schema is stable.
2. Dedupe covers provider ID, canonical URL and content hash.
3. Provenance is preserved.
4. Repeated scans are idempotent.
