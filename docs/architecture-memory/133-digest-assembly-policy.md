# 133. Digest Assembly Policy

## Status

Locked for product/intelligence baseline.

## Research Anchors

- OpenAI evaluation best practices: https://platform.openai.com/docs/guides/evaluation-best-practices
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework

## Decision

Digests are deterministic product artifacts generated from versioned inputs: topic rules, selected clusters/items, ranking policy, summary policy and delivery schedule.

## Digest Inputs

Digest generation records:

- tenant id;
- topic ids;
- source kinds;
- time window;
- topic rule versions;
- ranking policy version;
- summary policy version;
- model/provider version;
- item/cluster ids included;
- excluded reason counts.

## Assembly Steps

1. Select eligible items/clusters by topic and time window.
2. Filter by source/user exclusions.
3. Deduplicate and cluster.
4. Rank by relevance, novelty, recency and source priority.
5. Apply digest size constraints.
6. Generate or reuse summaries.
7. Validate structured output.
8. Persist digest artifact.
9. Enqueue deliveries idempotently.

## Frequency

Supported frequencies:

- realtime alert;
- hourly;
- daily;
- weekly;
- manual/on-demand.

Realtime alerts use stricter thresholds than digests to avoid noise.

## Best-Fact Choice

Digest generation must be reproducible. Without versioned inputs, users cannot understand why a digest changed and evals cannot compare behavior across model/prompt updates.

