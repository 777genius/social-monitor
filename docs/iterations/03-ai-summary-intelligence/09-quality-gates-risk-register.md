# Iteration 03 - Quality Gates And Risk Register

## Hard Gates

1. `SummaryPolicy` aggregate exists.
2. Summary rules validate before provider calls.
3. `AiSummarizerPort` exists.
4. Provider adapter is replaceable.
5. Structured output schema is validated.
6. Every summary has source evidence links.
7. Cost and token telemetry are stored.
8. Eval harness exists.
9. Summary REST endpoints expose status, latest summary and history.
10. Feedback endpoint exists.

## Architecture Checks

- Prompt templates do not own domain invariants.
- AI provider DTOs do not enter domain.
- Summary jobs are idempotent.
- Summary events are versioned.
- Citation model references normalized feed items, not raw provider payloads.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Summary contains unsupported claims | Trust loss | Require evidence links and validation. |
| Model output is malformed | Runtime failures | Validate schema and retry safely. |
| AI costs spike | Budget failure | Track tokens/cost and enforce quotas. |
| Prompt changes regress quality | Bad summaries | Run eval harness on changes. |
| Feed too large for context | Missing key info | Add ranking/clustering before prompt assembly. |

## Edge Cases To Recheck

- Source item disappears after summary.
- User changes summary policy during a running job.
- Provider times out after partial response.
- Summary has no useful items to summarize.
- Topic language differs from source language.

## Transition Criteria

Move to Iteration 04 only when latest topic summary is cited, auditable, cost-tracked and retrievable through REST.
