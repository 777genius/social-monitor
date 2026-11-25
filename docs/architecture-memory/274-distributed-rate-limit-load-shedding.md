# 274 - Distributed Rate Limit And Load Shedding

## Decision

Rate limiting and load shedding are first-class reliability mechanisms.

The platform must reject, delay or degrade work before overload becomes a cascading failure.

## Sources

- Google SRE, cascading failures: https://sre.google/sre-book/addressing-cascading-failures/
- Google SRE, handling overload: https://sre.google/sre-book/handling-overload/
- Azure Throttling pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/throttling
- Redis rate limiting concepts: https://redis.io/glossary/rate-limiting/

## Limit Scopes

Required scopes:

- global API
- tenant
- user
- API key
- source provider
- source binding
- AI provider/model
- webhook endpoint
- worker class

Rate limits must be explainable in tenant-visible errors where appropriate.

## Load Shedding

When overloaded, shed lowest-value work first:

1. non-urgent backfills
2. deep comment ingestion
3. non-urgent summaries
4. optional enrichments
5. low-priority webhooks
6. interactive reads last

Audit/security events are not shed.

## Queue Admission Control

Schedulers check:

- queue depth
- oldest job age
- worker capacity
- provider budget
- tenant budget
- DB health
- AI token budget

If unhealthy, do not enqueue more work blindly.

## API Rate Limits

API limits return Problem Details with:

- `rate_limited`
- `quota_exceeded`
- `retry_after` where known
- quota scope

Do not disclose sensitive internal capacity details.

## Provider Quota Limits

Provider quota is enforced before dispatch.

If provider returns quota/rate-limit response:

- parse retry-after/reset when supplied
- update budget state
- pause affected scope
- avoid worker retry storms

## Fairness

Fair scheduling prevents one tenant/topic/provider from consuming all capacity.

Use:

- per-tenant concurrency caps
- weighted queues
- source binding limits
- priority classes
- aging to avoid starvation

## Architecture Rule

The system should say "not now" before it says "everything is down".
