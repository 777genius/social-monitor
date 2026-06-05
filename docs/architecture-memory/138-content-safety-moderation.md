# 138. Content Safety and Moderation

## Status

Locked for safety baseline.

## Research Anchors

- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework
- OpenAI deployment safety practices: https://openai.com/index/best-practices-for-deploying-language-models/

## Decision

The platform monitors public/social content and may ingest harmful text. Safety controls must reduce exposure, prevent amplification and keep user controls explicit.

## Safety Surfaces

| Surface | Risk |
|---|---|
| raw source content | harmful/offensive/illegal text, private data, spam |
| summaries | hallucinated or amplified harmful claims |
| alerts | user disruption, panic/noise |
| digests | repeated exposure to unwanted topics |
| search | accidental discovery of sensitive content |
| admin/support | operator exposure to harmful raw data |

## Controls

- classify high-risk content when required by feature/use case;
- allow topic-level exclusions and muted terms;
- do not include raw harmful details in notification previews unless user explicitly configured it;
- keep summaries neutral and source-grounded;
- avoid generating instructions for wrongdoing from source content;
- log safety classification metadata without storing unnecessary raw text in logs.

## User Controls

Users need:

- topic filters/exclusions;
- alert threshold controls;
- source muting;
- report bad summary;
- hide/suppress item;
- digest frequency control.

## Best-Fact Choice

For this product, moderation is not only community moderation. It is output safety and exposure control over third-party content plus AI-generated summaries.

