# 136. LLM Provider Abstraction

## Status

Locked for intelligence baseline.

## Research Anchors

- OpenAI Structured Outputs: https://platform.openai.com/docs/guides/structured-outputs
- OpenAI evaluation best practices: https://platform.openai.com/docs/guides/evaluation-best-practices
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework

## Decision

LLM providers are replaceable adapters behind task-specific ports. The product must not embed one provider's prompt, model id or response quirks into domain logic.

## Ports

Initial ports:

- `RelevanceScoringPort`;
- `ClusterSummaryPort`;
- `DigestSummaryPort`;
- `TranslationPort`;
- `EmbeddingPort`;
- `SafetyClassificationPort`.

Each call records:

- provider;
- model;
- prompt/template version;
- schema version;
- input token estimate;
- output token estimate;
- cost estimate;
- latency;
- validation result;
- eval cohort where applicable.

## Structured Output Policy

Use JSON Schema/structured outputs for all machine-consumed model outputs. Free-form text is allowed only as final user-visible content that is wrapped in an artifact with metadata.

Validation flow:

```text
model call -> schema validation -> safety checks -> domain validation -> persist artifact
```

If schema validation fails, retry with bounded retry policy or fall back to a safer model/prompt. Do not persist invalid structured output as if it were accepted.

## Routing

Provider/model routing considers:

- task class;
- tenant plan;
- language;
- latency SLO;
- budget remaining;
- eval score;
- safety requirements;
- provider outage status.

## Best-Fact Choice

Model quality changes over time. The durable product boundary is task contracts, eval gates and artifact metadata, not a specific model name.

