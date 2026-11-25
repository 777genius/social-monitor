# Iteration 03 - Review Checklists

## Summary Domain Review

1. `SummaryPolicy` validates rules before provider calls.
2. Summary jobs are tenant-scoped and idempotent.
3. Evidence model references normalized feed items.
4. Prompt templates do not own domain invariants.

## AI Adapter Review

1. AI provider is behind a port.
2. Structured output is schema-validated.
3. Malformed output has safe retry/failure behavior.
4. Cost/token telemetry is captured.

## Quality Review

1. Eval harness runs on prompt/model changes.
2. Final summaries are cited.
3. Feedback taxonomy is captured.
4. Summary failure is visible separately from feed failure.
