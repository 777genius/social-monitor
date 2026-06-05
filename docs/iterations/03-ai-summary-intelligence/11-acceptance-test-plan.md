# Iteration 03 - Acceptance Test Plan

## Acceptance Scenarios

1. Valid summary policy is accepted.
2. Invalid summary policy is rejected before provider call.
3. Summary job selects feed items and builds evidence bundle.
4. AI provider adapter returns structured output.
5. Malformed structured output is rejected and retried safely.
6. Persisted summary contains citations to normalized feed items.
7. Summary API returns latest summary, history and status.
8. Feedback endpoint stores useful/noisy/missing/wrong signals.
9. Token and cost telemetry is stored per summary job.
10. Eval harness runs on golden HN/RSS examples.

## Negative Scenarios

1. Provider timeout creates failed summary status without corrupting feed.
2. No relevant feed items produces explicit empty summary state.
3. Summary claim without citation fails validation.
4. Tenant AI budget exhaustion blocks job with visible reason.

## Regression Checks

- Prompt changes require eval run.
- Citation model still references normalized feed items.
- Provider DTOs do not leak into domain.
- Summary status events stay versioned.

## Pass Criteria

Summarization is accepted when a topic has cited, auditable, cost-tracked summaries retrievable through REST.
