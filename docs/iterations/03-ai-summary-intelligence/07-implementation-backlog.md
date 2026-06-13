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

## Implemented Evidence

- PR 38 feed-backed summary evidence selection added: `SummaryEvidenceSelectorPort` now has a runtime adapter backed by the Feed read repository port, so completed summaries can cite real feed/source items instead of always producing `no_signal`.
- Feed exposes a DI token for `FeedItemReadRepositoryPort`; Summary imports only the Feed port and `FeedRestModule`, preserving Clean Architecture and avoiding cross-context adapter imports.
- Fast smoke coverage proves a feed item can become a completed summary artifact with key point `c1`, citation map, selected feed item ids and `summary.ready` event.
- PR 39 topic-scoped feed evidence added: scan commands now carry `topicId` from Monitoring to Ingestion, feed items persist it, feed list/read DTOs expose it and Summary evidence selection filters by topic. Feed canonical dedupe is tenant/workspace/topic scoped so the same URL can safely appear in different topics.
