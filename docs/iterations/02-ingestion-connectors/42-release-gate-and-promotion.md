# Iteration 02 - Release Gate And Promotion

## Promotion Goal
Approve movement from ingestion into summary intelligence.

## Required Evidence
- SourceProviderPort is stable.
- HN/RSS/fake adapters pass certification tests.
- Normalized feed items have stable IDs and provenance.
- Cursor commit behavior is tested.
- Scan failure/status behavior is observable.

## Promotion Checks
- Downstream consumers do not need provider-specific fields.
- Cursor advances only after durable writes.
- Duplicate provider items do not duplicate feed records.
- Provider failures map to stable error categories.
- `npm run check:source-certification` passes and `ops/ingestion/source-provider-certification.json` is current.

## Hold Conditions
- Feed schema is still provider-shaped.
- Source certification gate or evidence artifact is missing/stale.
- Cursor behavior under crash/retry is unclear.
- Unsupported source strategy is treated as production-ready.

## Rollback Or Rework
- Rework normalized schema before summarization consumes it.
- Rework adapter certification before adding more sources.
- Rework cursor semantics before scheduler scale-up.

## Approval
Ingestion may promote only when summaries can consume normalized feed data without provider-specific logic.
