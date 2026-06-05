# Iteration 03 - Implementation Backlog

## Purpose

Build summarization as a governed domain workflow with citations, budget control, evaluation and provider replaceability.

## Domain Backlog

1. Define `SummaryPolicy` aggregate.
2. Define `SummaryRequest` command.
3. Define `SummaryJob` lifecycle.
4. Define `SummaryOutput` with sections, bullets, citations and confidence metadata.
5. Define `SourceEvidence` mapping from summary claims to feed item IDs.
6. Define tenant-level AI budget and per-topic summary budget.
7. Define language, tone, length and format constraints as value objects.

## AI Adapter Backlog

1. Define `AiSummarizerPort`.
2. Define provider adapter interface for model selection, structured output and retry handling.
3. Add prompt template registry.
4. Add model configuration by environment.
5. Add token/cost estimation.
6. Add timeout and cancellation behavior.
7. Add redaction hook for sensitive data.
8. Add fallback behavior when provider fails.

## Pipeline Backlog

1. Select candidate feed items.
2. Cluster near-duplicates.
3. Rank relevance to topic.
4. Build source bundle with citations.
5. Execute summary job.
6. Validate structured output.
7. Persist summary and evidence links.
8. Emit `summary.completed`.
9. Expose summary history via REST.

## Evaluation Backlog

1. Create golden datasets from HN/RSS examples.
2. Define eval criteria: factuality, citation coverage, relevance, brevity, rule adherence.
3. Add regression eval command.
4. Track provider/model cost per summary.
5. Add human feedback fields: useful, noisy, missing, wrong.

## Edge Cases

- Source item disappears after summary.
- Summary rule asks for no citations.
- Prompt output fails schema validation.
- Provider returns partial response.
- User changes rules while summary job is running.
- Feed has too many items for context window.
- Multiple summaries compete for tenant AI budget.

## Validation

- Every summary links back to source evidence.
- Invalid model output is rejected and retried safely.
- Cost and token usage are visible.
- Summary rules change output without changing domain code.
