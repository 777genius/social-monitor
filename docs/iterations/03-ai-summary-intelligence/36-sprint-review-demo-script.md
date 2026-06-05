# Iteration 03 - Sprint Review Demo Script

## Review Goal
Prove that summaries are cited, validated, provider-neutral and cost-aware.

## Demo Flow
1. Create or select a summary policy.
2. Run summarization over normalized feed items.
3. Show final summary with citations.
4. Demonstrate structured-output validation failure handling.
5. Run eval harness on a small golden dataset.

## Evidence To Show
- SummaryPolicy can be validated without provider calls.
- Final summaries cite feed item IDs.
- AI provider is behind a port.
- Usage/cost telemetry is captured.
- Invalid model output is rejected.

## Edge Cases To Exercise
- Provider returns malformed structured output.
- Summary includes uncited claim.
- Evidence items conflict.
- Token budget is exceeded.

## Review Questions
- Can mobile show summary trust evidence clearly?
- Can provider/model choice change without domain changes?
- Are evals strong enough to catch hallucination-prone outputs?

## Accept Progress If
- Uncited final summaries are blocked.
- Evals run repeatably.
- Cost and failure telemetry are visible.
