# Iteration 02 - Operational Runbook

## Daily Workflow

1. Run connector certification tests before adapter changes merge.
2. Execute HN/RSS fixture tests.
3. Run repeated scan idempotency check.
4. Inspect dead-letter output for failed provider scenarios.
5. Verify cursor updates happen after item persistence.
6. Check feed dedupe output for cross-source duplicates.

## Review Cadence

- SDK review before real adapters.
- Adapter review after HN/RSS mapping.
- Scheduler review before workers run repeatedly.
- Feed provenance review before summary work starts.

## Blockers

- Provider payload cannot be normalized deterministically.
- Cursor semantics are unclear.
- Worker lease cannot prevent duplicate processing.
- Provider failure is not classified.
- Feed item lacks provenance.

## Handoff Notes

- Hand off normalized feed schema to summary lane.
- Hand off feed endpoints to Flutter lane.
- Hand off provider failure taxonomy to realtime/notification lane.
- Hand off source health signals to ops lane.

## Support And Ops Impact

- Failed scans must have reason, tenant, source binding and correlation ID.
- Provider quota and rate-limit states must be visible.
- Deduplication decisions must be explainable when users see fewer items than expected.
