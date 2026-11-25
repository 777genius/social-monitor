# 279 - AI Cost Latency Routing Policy

## Decision

AI model routing is policy-driven by task class, latency requirement, quality target and budget.

Do not send all work to the strongest synchronous model by default.

## Sources

- OpenAI Prompt Caching: https://platform.openai.com/docs/guides/prompt-caching
- OpenAI Batch API: https://platform.openai.com/docs/guides/batch
- OpenAI rate limits: https://platform.openai.com/docs/guides/rate-limits
- OWASP LLM Top 10, unbounded consumption: https://owasp.org/www-project-top-10-for-large-language-model-applications/

## Task Classes

Interactive:

- user requests fresh summary now
- small window
- strict latency target

Scheduled:

- digest generation
- periodic summaries
- non-urgent

Bulk:

- backfills
- evaluations
- embedding large source sets
- retrospective reports

## Routing Rules

Interactive:

- low latency model first if quality sufficient
- bounded input window
- fail fast/degrade if provider unavailable

Scheduled:

- use batch where SLA permits
- use cheaper model tier where evals pass
- coalesce repeated requests

Bulk:

- batch API preferred
- separate budget pool
- pauseable/resumable jobs

## Prompt Caching

Use stable prefixes for:

- summary instructions
- schema instructions
- citation rules
- safety policy

Track:

- cached tokens
- uncached tokens
- cache hit ratio
- latency difference
- cost difference

Do not rely on prompt caching for correctness.

## Budget Controls

Enforce:

- per-tenant AI budget
- per-topic budget
- per-summary token cap
- daily/monthly provider budget
- eval budget
- backfill budget

If budget is exhausted, return tenant-visible degraded status instead of retrying.

## Rate Limits

AI provider rate limits affect:

- scheduler dispatch
- worker concurrency
- queue backoff
- circuit breaker state
- fallback model choice

## Architecture Rule

Quality, latency and cost are all product requirements.

Model choice is a routing decision, not a hardcoded constant.
