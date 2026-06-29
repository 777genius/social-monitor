# 109. AI Evaluation Gates

## Status

Locked for implementation blueprint.

## Research Anchors

- OpenAI evaluation best practices: https://platform.openai.com/docs/guides/evaluation-best-practices
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework

## Decision

Every production model/prompt/rules change must pass eval gates for relevance scoring, clustering and summaries.

## Evaluation Sets

Maintain versioned datasets:

| Dataset | Purpose |
|---|---|
| `summary_golden` | expected summary quality for known item clusters |
| `relevance_golden` | topic-to-item relevance labels |
| `dedupe_golden` | duplicate/near-duplicate clusters |
| `prompt_injection_redteam` | malicious source text and instruction attacks |
| `multilingual_golden` | language and translation behavior |
| `low_signal_noise` | spam/noisy threads and irrelevant mentions |

## Metrics

Track:

- factuality against source items;
- citation/source coverage;
- missing critical points;
- hallucinated claims;
- relevance precision/recall;
- cluster purity;
- language correctness;
- refusal/abstention correctness;
- cost per accepted summary;
- latency per item/cluster.

## Gates

A model or prompt change cannot ship if:

- hallucination rate increases beyond threshold;
- injection red-team pass rate falls;
- relevance precision drops below accepted floor;
- cost per accepted summary exceeds plan budget;
- structured output validation failure rate rises;
- latency violates summary SLO.

## Human Review

Use human review for:

- new domains/interests;
- high-impact alert templates;
- eval dataset updates;
- disagreements between automated graders and product expectation.

## Best-Fact Choice

LLM quality must be measured as product behavior, not model reputation. Evaluation datasets and regression gates are more important than choosing a fashionable model.

