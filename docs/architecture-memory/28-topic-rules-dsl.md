# Topic Rules & User Configuration DSL

Date: 2026-05-31
Status: baseline topic/rule memory

## Decision

User-defined monitoring and summary rules should be structured configuration, not arbitrary code or raw prompt strings.

Use JSON Schema to validate rule configuration. Start with a constrained product-owned rule model. Consider CEL later only if the product needs safe user expressions.

References:

- JSON Schema 2020-12: https://json-schema.org/draft/2020-12
- Common Expression Language: https://cel.dev/overview/cel-overview
- OPA/Rego policy language: https://www.openpolicyagent.org/docs/policy-language

## Why Not Arbitrary User Code

Arbitrary code creates:

- security risk;
- performance risk;
- sandboxing burden;
- support/debuggability issues;
- impossible cost prediction.

## Why Not Raw Prompts Only

Raw prompts create:

- inconsistent outputs;
- prompt injection surface;
- difficult UI;
- hard versioning;
- hard testing/evaluation;
- no reliable cost guardrails.

## Topic Rule Shape

```text
topic_rule
  id
  tenant_id
  topic_id
  version
  name
  include_keywords
  exclude_keywords
  required_phrases
  source_filters
  author_filters
  language_filters
  freshness_window
  min_engagement
  relevance_threshold
  semantic_queries
  negative_semantic_queries
  status
```

## Summary Rule Shape

```text
summary_rule
  id
  tenant_id
  topic_id nullable
  version
  name
  objective
  output_language
  length
  tone
  include_links
  include_citations
  include_sentiment
  include_action_items
  include_risk_flags
  source_filters
  model_policy
  schema_version
  status
```

## Versioning

Rules are immutable once used by a job.

Changing a rule creates a new version:

```text
summary_rule_id stable
summary_rule_version increments
summary jobs reference exact version
```

## Future Expression Language

If simple product configuration is not enough:

1. Add CEL for safe typed expressions.
2. Avoid OPA/Rego for end-user topic rules; reserve it for platform/security policy.
3. Keep all expressions bounded by execution limits and schema validation.

## Locked Decisions

1. Topic/summary rules are structured and versioned.
2. Raw prompts are not the primary user customization surface.
3. User rules are validated with JSON Schema.
4. Rule changes create new versions.
5. CEL is a later option; arbitrary user code is forbidden.

