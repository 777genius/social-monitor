# 164. Evaluation Dataset Governance

## Status

Locked for AI quality baseline.

## Research Anchors

- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- NIST AI measurement/evaluation resources: https://www.nist.gov/artificial-intelligence
- OpenAI evaluation best practices: https://platform.openai.com/docs/guides/evaluation-best-practices

## Decision

Evaluation datasets are governed data assets with provenance, review and versioning. They are not disposable test fixtures.

## Dataset Metadata

Each eval dataset records:

- dataset id/version;
- task type;
- source of examples;
- labeling method;
- reviewer/approver;
- language/domain coverage;
- sensitive data classification;
- allowed use;
- creation date;
- retirement date where applicable.

## Labeling Rules

- Use clear rubrics for relevance, factuality and harmful-output checks.
- Keep disagreement records for hard examples.
- Separate training/tuning data from evaluation data.
- Include negative and low-signal examples.
- Include multilingual and source-specific examples.
- Redact or synthesize sensitive examples where possible.

## Regression Policy

Model/prompt/router changes compare against current and previous eval baselines. If a change improves average quality but worsens critical slices, it needs explicit approval.

Critical slices:

- source policy sensitive content;
- prompt injection examples;
- low-resource languages;
- high-priority tenants/topics;
- noisy/spam-heavy threads.

## Best-Fact Choice

Eval datasets become product memory. Without governance, the system will overfit to stale examples and regress on important edge cases.

