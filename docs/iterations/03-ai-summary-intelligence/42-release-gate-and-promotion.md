# Iteration 03 - Release Gate And Promotion

## Promotion Goal
Approve movement from summary intelligence into mobile MVP implementation.

## Required Evidence
- SummaryPolicy is validated.
- Summaries are cited to feed item IDs.
- Structured output validation rejects invalid provider output.
- Eval harness runs against golden cases.
- Usage and cost telemetry are recorded.

## Promotion Checks
- Final summaries cannot contain uncited claims.
- Provider SDK/types do not leak into domain or public API.
- Summary failure states are explicit.
- Citation shape is stable enough for mobile.

## Hold Conditions
- Uncited final summary can be persisted.
- Evals are manual only.
- Cost cannot be attributed to tenant/topic/job.
- Mobile cannot display trust evidence.

## Rollback Or Rework
- Rework citation model before mobile UI starts.
- Rework provider port before adding provider-specific behavior.
- Rework evals before prompt/model changes continue.

## Approval
Summary intelligence may promote only when mobile can render summaries, citations and failure states reliably.
