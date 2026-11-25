# AI Risk Management

Date: 2026-05-31
Status: deeper research layer

## Decision

Treat AI summaries as traceable generated artifacts, not source truth.

Every summary must be explainable through:

```text
Summary
-> SummaryJob
-> SummaryRule version
-> PromptTemplate version
-> Model version
-> ItemCluster
-> NormalizedItems
-> SourceItems
-> RawPayloadRefs
-> ConnectorRun
-> Provider
```

## Governance Baseline

For MVP, do not overbuild ISO/NIST compliance machinery. But design so the project can later map to:

- NIST AI RMF;
- NIST Generative AI Profile;
- ISO/IEC 42001;
- OWASP AI Testing Guide;
- EU AI Act transparency expectations where applicable.

References:

- NIST AI RMF: https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI RMF Generative AI Profile: https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf
- ISO/IEC 42001: https://www.iso.org/standard/42001
- OWASP AI Testing Guide: https://owasp.org/www-project-ai-testing-guide/
- EU AI Act overview: https://www.europarl.europa.eu/topics/en/article/20230601STO93804/eu-ai-act-first-regulation%20on-artificial-intelligence

## AI Risk Controls

Required from early architecture:

- source content is untrusted data, never instructions;
- prompts separate system rules, user summary rules and source content;
- output schema validation;
- summary trust levels;
- citation/source coverage metrics;
- hallucination/factual consistency evals;
- model/prompt/schema versioning;
- cost tracking per tenant/topic/job;
- feature-flagged model/prompt rollout;
- rollback path for prompt/model changes.

## Summary Trust Levels

```text
draft
validated_schema
source_grounded
user_approved
low_confidence
```

## Eval Gates

Prompt/model changes require eval gates before production rollout.

Metrics:

```text
schema_validity_rate
citation_coverage
factual_consistency
relevance_precision
duplicate_compression
summary_usefulness_score
cost_per_valid_summary
latency_p95
```

## Model Routing

Use model routing by task class, not one model for everything:

```text
cheap_relevance_filter
language_detection
topic_classification
embedding
cluster_summary
digest_summary
alert_summary
summary_quality_check
```

Routing inputs:

- tenant plan;
- summary rule;
- freshness requirement;
- source risk;
- content length;
- language;
- budget remaining;
- quality requirement.

All model calls go through `SummaryModelPort` / `AiModelPort`. No direct OpenAI/Anthropic SDK usage inside feature modules.

