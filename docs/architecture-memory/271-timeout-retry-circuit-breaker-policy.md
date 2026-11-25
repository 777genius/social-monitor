# 271 - Timeout Retry Circuit Breaker Policy

## Decision

Every outbound dependency call must have explicit timeout, retry and circuit-breaker behavior.

Retries are finite, budgeted and use exponential backoff with jitter. No unbounded retries are allowed.

## Sources

- AWS Builders Library, timeouts/retries/backoff with jitter: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- Azure Retry pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/retry
- Azure Circuit Breaker pattern: https://learn.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker
- Google SRE, cascading failures: https://sre.google/sre-book/addressing-cascading-failures/

## Required For

- source provider APIs
- AI provider APIs
- email/push/webhook providers
- object storage
- internal gRPC calls
- broker admin calls
- external auth/IdP calls
- search/vector services

## Timeout Policy

Every client call defines:

- connect timeout
- request/response timeout
- total operation deadline
- cancellation behavior
- fallback behavior

Default SDK timeouts must be reviewed. Do not assume SDK defaults are safe.

## Retry Policy

Retries require:

- retryable error list
- non-retryable error list
- max attempts
- exponential backoff
- jitter
- total retry budget
- idempotency key for side effects

Retry only transient failures:

- timeout
- 502/503/504
- provider-specific throttling with retry-after
- temporary network failure

Do not retry:

- authentication failure
- authorization failure
- invalid query
- quota exhausted until reset
- validation errors
- payment/billing denial

## Circuit Breaker

Circuit breaker states:

- closed
- open
- half-open

Open circuit when failure/rate-limit thresholds indicate dependency is unhealthy.

While open:

- fail fast
- update provider health
- stop scheduling new expensive work
- preserve existing tenant configuration
- retry only through controlled half-open probes

## Retry Storm Prevention

Required:

- global provider retry budget
- per-tenant retry budget
- worker concurrency caps
- queue backoff
- jitter
- circuit breaker
- load shedding

Never let every worker retry at the same interval.

## Observability

Track:

- timeout count
- retry attempts
- retry exhaustion
- circuit state changes
- retry-after honored
- dependency latency
- fail-fast count

## Architecture Rule

Retries are medicine in small doses.

Without budgets and breakers, they become an outage amplifier.
