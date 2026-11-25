# Iteration 03 - Detailed Execution Plan

## Purpose

Implement AI summaries as structured, cited, versioned domain artifacts.

## Phase 01 - Summary Domain Contract

### Steps

1. Define `SummaryRequest`.
2. Define `SummaryArtifact`.
3. Define output schema:
   - title
   - short summary
   - key points
   - risks/unknowns
   - source citations
   - confidence
4. Define citation model.
5. Define summary states.
6. Define rule set:
   - tone
   - length
   - focus
   - excluded sources/terms
   - language
7. Define item selection window.
8. Define no-signal output.
9. Define claim-to-citation validation.
10. Define lineage metadata for policy, prompt, schema, model, provider and eval dataset.

### MVP Domain Implementation Steps

1. Implement `SummaryPolicy` value objects for length, language, focus, exclusions and citation strictness.
2. Implement `SummaryRequest` aggregate/job command with tenant/workspace/topic scope and idempotency.
3. Implement evidence window selector with frozen feed/source item ids and window hash.
4. Implement `SummaryArtifact` state machine.
5. Implement schema v1 as contract and validator.
6. Implement citation validator against frozen evidence window.
7. Implement no-signal artifact factory.
8. Implement stale marker when new feed items arrive after source window.
9. Implement feedback record and taxonomy.
10. Implement repository ports for request, artifact, feedback and lineage lookup.

### Edge Cases

- No relevant items.
- Conflicting items.
- Deleted cited item.
- User changes rules while job runs.
- New feed items arrive while summary is running.
- Deduped item changes citation target after summary generation.
- Evidence window contains only unavailable/deleted items.
- User submits same regenerate command twice.
- Summary policy asks for unsupported language or format.
- Citation references item from another tenant/topic.

### Acceptance Gate

- Summary schema is documented and validated.
- Completed summaries always have lineage and valid claim-level citations.
- State transitions, no-signal, stale and feedback records are domain-tested.

## Phase 02 - AI Provider Adapter

### Steps

1. Define `AiSummaryProviderPort`.
2. Define provider request/response DTOs isolated in adapter.
3. Add model routing.
4. Add prompt template registry.
5. Add prompt/schema/model version metadata.
6. Add timeout and retry policy.
7. Add structured output validation.
8. Add repair policy for invalid output.
9. Add cost estimation before execution.
10. Add privacy redaction hook.
11. Add provider fallback policy.
12. Add prompt-injection fixtures and guardrails.
13. Add model/prompt version pinning.

### MVP Provider Implementation Steps

1. Implement deterministic fake provider first.
2. Implement provider request builder with whitelisted prompt variables.
3. Implement token/cost estimator and budget preflight.
4. Implement one real provider adapter behind `AiSummaryProviderPort`.
5. Implement provider response parser.
6. Run schema validation before business validation.
7. Run citation validation before persistence as completed.
8. Implement bounded retry/repair/fallback policy.
9. Persist provider attempt metadata with redacted/safe fields only.
10. Emit usage record and summary status event.

### Edge Cases

- Provider returns prose instead of JSON.
- Provider truncates output.
- Provider refuses content.
- Provider latency exceeds SLA.
- Tenant has AI disabled.
- Source content attempts to override summarizer instructions.
- Retry would exceed tenant/topic budget.
- Provider returns valid schema but low-quality unsupported content.
- Fallback provider is available but not certified for schema v1.
- Repair attempt consumes final budget and leaves no room for retry.
- Provider returns citations using display labels instead of ids.

### Acceptance Gate

- Fake AI provider and real adapter follow same port.
- Invalid model output cannot persist as completed summary.
- Provider attempt metadata is stored for audit without logging sensitive raw prompts by default.
- Prompt-injection, repair and fallback behavior are covered by fixtures.

## Phase 03 - Evals And Quality

### Steps

1. Build fixture dataset.
2. Add tests for:
   - noisy items
   - conflicting items
   - multilingual items
   - empty windows
   - long windows
3. Add citation coverage metric.
4. Add hallucination heuristic checks.
5. Add relevance quality checks.
6. Add prompt regression test.
7. Add cost regression test.
8. Add summary snapshot review policy.
9. Add feedback-to-eval-fixture workflow.
10. Add blocking thresholds for schema, citation, prompt-injection and cost regression.

### MVP Eval Pack

1. Empty/no-signal topic.
2. Noisy feed with many irrelevant items.
3. Conflicting evidence from two sources.
4. Same story across HN/RSS with different wording.
5. Multilingual items and requested output language.
6. Source limitation where comments/backfill are unavailable.
7. Prompt-injection text embedded in source item.
8. Long context requiring selection/truncation.
9. Provider malformed JSON.
10. Valid schema with uncited claim.
11. Valid citation id but irrelevant evidence.
12. Cost regression fixture.
13. Feedback-derived wrong fact fixture.

### Edge Cases

- Summary omits minority but important source.
- Summary overstates weak signal.
- Summary cites irrelevant item.
- Regression improves style but worsens factuality.
- Eval dataset no longer matches current normalized feed schema.
- Eval fixture uses old feed item schema after ingestion changes.
- Model-graded score improves while citation validator catches factual drift.
- Cost regression is caused by input selection change, not prompt change.

### Acceptance Gate

- Evals run in CI or pre-release workflow.
- Prompt changes require evaluation results.
- Blocking eval regressions prevent promotion.
- Eval report includes prompt/schema/model/provider/dataset versions and cost deltas.

## Phase 04 - Summary UX Readiness

### Steps

1. Add summary list endpoint.
2. Add summary detail endpoint.
3. Add regenerate endpoint.
4. Add summary job status endpoint.
5. Add source citation expansion.
6. Add empty/no-signal UI contract.
7. Add low-confidence/review-required state.
8. Add summary rule editing API.
9. Add summary feedback taxonomy endpoint or contract.
10. Add stale-summary indicator contract.

### UX Contract Rules

1. Summary list shows state, freshness, source window, quality flags and cost-safe metadata.
2. Summary detail shows citations with feed/source item expansion links.
3. No-signal state has explicit reason and does not look like failure.
4. Review-required state explains limitation without exposing internal prompt/provider details.
5. Stale state shows newer evidence exists and offers regenerate when allowed.
6. Feedback endpoint records taxonomy and optional field-level reference.
7. Regenerate endpoint is idempotent and returns existing in-flight operation when the same request repeats.

### Edge Cases

- User regenerates repeatedly.
- Summary is stale after new scan.
- Citation source is unavailable.
- User wants summary in different language.
- User disputes a summary fact and feedback must preserve evidence.
- Mobile opens detail after summary has been superseded.
- Citation expansion fails because source item retention removed raw body.
- Feedback is submitted while regenerate is already running.

### Acceptance Gate

- Frontend can display summary with citations and status without additional backend hacks.
- Frontend can show stale, review-required, no-signal and feedback-submitted states.
