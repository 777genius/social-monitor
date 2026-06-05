# 192. LLM Caching and Reuse Policy

## Status

Locked for AI/FinOps/privacy baseline.

## Research Anchors

- OpenAI prompt caching: https://platform.openai.com/docs/guides/prompt-caching
- OpenAI prompt caching announcement: https://openai.com/index/api-prompt-caching/
- OpenAI evaluation best practices: https://platform.openai.com/docs/guides/evaluation-best-practices

## Decision

Use caching/reuse to reduce cost and latency, but never at the expense of privacy, tenant isolation or explainability.

## Cache Types

| Cache | Allowed | Notes |
|---|---|---|
| provider prompt prefix cache | yes | automatic/short-lived provider behavior |
| deterministic embedding cache | yes | keyed by normalized text hash + model/version |
| summary artifact reuse | yes | same cluster + policy + model/prompt/schema |
| raw response cache | restricted | only for non-sensitive deterministic internal tasks |
| cross-tenant content cache | generally no | requires explicit privacy/source policy review |

## Rules

- Cache keys include model, prompt version, schema version and tenant/source policy where relevant.
- Summary reuse must preserve provenance and input ids.
- Do not reuse summaries across tenants unless the source content is public, policy allows it and privacy review approves.
- Provider prompt caching is not treated as durable storage or correctness mechanism.
- Cost reports track cached vs uncached token usage where provider reports it.

## Best-Fact Choice

Caching LLM work is important for cost, but the safe default is tenant-scoped artifact reuse plus provider prefix caching, not global response caching.

