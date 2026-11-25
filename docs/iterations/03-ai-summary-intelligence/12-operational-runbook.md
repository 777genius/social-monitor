# Iteration 03 - Operational Runbook

## Daily Workflow

1. Validate summary policy changes with domain tests.
2. Run structured output validation tests.
3. Run eval harness after prompt/model changes.
4. Inspect citation coverage for generated summaries.
5. Check cost/token telemetry for every summary job.
6. Review failed summary jobs for actionable status.

## Review Cadence

- Summary policy review before provider adapter.
- Prompt review before eval baseline.
- Evidence/citation review before mobile summary UI.
- Cost review before beta hardening.

## Blockers

- Summary output cannot be traced to feed items.
- Provider output is unstable and not validated.
- Costs are not measurable.
- Prompt rules conflict with domain rules.
- Eval harness does not cover core source examples.

## Handoff Notes

- Hand off summary REST contract to Flutter lane.
- Hand off summary events to realtime lane.
- Hand off cost metrics to ops lane.
- Hand off feedback taxonomy to beta launch lane.

## Support And Ops Impact

- Support must distinguish feed failure from summary failure.
- Summary quality issues should be tagged as topic-rule, source-data, model-output or citation issue.
- Cost spikes must be diagnosable by tenant/topic/job.
