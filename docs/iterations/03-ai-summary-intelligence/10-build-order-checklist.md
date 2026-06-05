# Iteration 03 - Build Order Checklist

## Build Order

1. Define `SummaryPolicy`.
2. Define summary rule value objects.
3. Define evidence model.
4. Define summary job lifecycle.
5. Define `AiSummarizerPort`.
6. Define structured output schema.
7. Implement prompt template registry.
8. Implement AI provider adapter.
9. Add schema validation.
10. Add cost/token tracking.
11. Implement item selection and clustering.
12. Implement summary use case.
13. Persist summaries and citations.
14. Add eval harness.
15. Expose summary REST endpoints.
16. Expose feedback endpoint.
17. Add stale/no-signal/review-required UX states.
18. Add feedback-to-eval fixture workflow.

## First PR Sequence

1. PR 1: summary policy, rule value objects and invalid-policy tests.
2. PR 2: evidence window selector, frozen window hash and citation id contract.
3. PR 3: summary artifact state machine and schema v1 validator.
4. PR 4: deterministic fake AI provider and malformed-output fixtures.
5. PR 5: prompt template registry, versioning and prompt-injection fixtures.
6. PR 6: real provider adapter with budget preflight and safe metadata capture.
7. PR 7: citation/business validation and no-signal artifact factory.
8. PR 8: eval harness, release thresholds and cost regression.
9. PR 9: REST endpoints for request/list/detail/regenerate/status.
10. PR 10: feedback endpoint and feedback-to-eval workflow.

## Contracts First

- Summary policy API.
- Summary output schema.
- Evidence/citation schema.
- Summary status events.
- Feedback API.
- Summary schema v1.
- Evidence window/freshness contract.
- Provider attempt metadata contract.
- Eval report format.

## Tests And Checks

- Invalid policy domain tests.
- Malformed provider output tests.
- Citation coverage checks.
- Eval regression command.
- Cost limit checks.
- Prompt-injection fixture checks.
- No-signal and conflicting-evidence checks.
- Stale summary state checks.
- Feedback taxonomy persistence checks.

## Edge Cases Before Closure

- No relevant feed items.
- Feed exceeds context window.
- Source item unavailable after summary.
- Summary rule changes mid-job.
- AI provider times out.
- Provider returns valid JSON with invalid citations.
- Regenerate is retried with the same idempotency key.
- Cost estimate undercounts actual provider usage.
- Feedback arrives after summary was superseded.

## Closure

Close only when a latest summary is cited, auditable, cost-tracked and available through REST.
