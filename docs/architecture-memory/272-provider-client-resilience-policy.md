# 272 - Provider Client Resilience Policy

## Decision

Every external provider client is isolated behind a provider adapter with bulkheads, budgets, fallback behavior and typed error mapping.

Provider SDKs are not used directly from use cases or workers.

## Sources

- AWS Builders Library, dependency isolation: https://aws.amazon.com/builders-library/dependency-isolation/
- Azure Bulkhead pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/bulkhead
- Azure Transient Fault Handling: https://learn.microsoft.com/en-us/azure/architecture/best-practices/transient-faults
- Google SRE, overload/cascading failures: https://sre.google/sre-book/addressing-cascading-failures/

## Bulkhead Boundaries

Use separate pools/budgets for:

- Reddit
- X
- Hacker News
- RSS/Atom
- Telegram
- OpenAI/AI providers
- email
- push
- webhooks

One failing provider must not starve all workers or shared connection pools.

## Adapter Responsibilities

Provider adapter owns:

- auth refresh
- timeout/retry/circuit breaker config
- rate-limit header parsing
- provider-specific errors
- request shaping
- response validation
- capability detection
- cost/usage emission
- trace attributes

Application layer receives provider-neutral results/errors.

## Fallback Policy

Fallbacks must be explicit:

- skip provider scan until next interval
- use cached result if still valid
- degrade summary freshness
- lower model tier
- reduce page/comment depth
- mark source attention required
- pause tenant binding

Silent fallback is forbidden.

## Provider Health

Provider health is tracked at multiple levels:

- global provider
- region/endpoint when relevant
- tenant credential
- source binding
- query/capability

Tenant-visible status should not expose internals, but must explain user-actionable states.

## Isolation Examples

X quota exhausted:

- open X circuit for affected quota scope
- stop X scan jobs
- keep HN/RSS/Reddit running
- show source degraded/limited

AI provider slow:

- reduce summary concurrency
- use batch for non-urgent summaries
- keep source ingestion running

Webhook receiver down:

- retry tenant webhook delivery
- do not block summary persistence

## Testing

Required:

- provider timeout fixture
- 429/retry-after fixture
- auth expired fixture
- malformed response fixture
- circuit open behavior
- bulkhead saturation test
- fallback status mapping

## Architecture Rule

Provider failures are expected input.

The platform must degrade by provider and tenant, not globally collapse.
