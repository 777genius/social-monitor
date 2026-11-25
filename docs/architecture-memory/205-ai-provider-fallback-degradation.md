# 205. AI Provider Fallback and Degradation

## Status

Locked for AI reliability baseline.

## Research Anchors

- OpenAI production best practices: https://platform.openai.com/docs/guides/production-best-practices
- OpenAI rate limit guidance: https://help.openai.com/en/articles/5955604
- OpenAI model availability: https://help.openai.com/en/articles/10362446
- Google SRE graceful degradation: https://sre.google/sre-book/addressing-cascading-failures/

## Decision

AI tasks must degrade gracefully under provider outage, rate limit, budget exhaustion or model quality regression. Fallback is task-specific and never silent when output quality changes materially.

## Fallback Order

For each AI task define:

- primary model/provider;
- compatible fallback models;
- cheaper fallback if budget constrained;
- no-AI fallback behavior;
- quality caveats;
- user-visible status if delayed/partial.

Examples:

- relevance scoring can fall back to lexical/rules scoring;
- summaries can be delayed or generated with lower-cost model if eval-approved;
- embeddings can queue until provider recovers;
- translation can be skipped with original-language artifact.

## Rules

- Fallback models must pass eval gates for the task.
- Structured output validation remains mandatory.
- Rate limits use exponential backoff with jitter and budget-aware retry.
- Provider incidents trigger kill switch or router update.
- Do not silently send sensitive data to a new provider not approved as subprocessor.

## Best-Fact Choice

AI reliability is not only uptime. It includes output validity, cost, approved data processing and user-visible quality expectations.

