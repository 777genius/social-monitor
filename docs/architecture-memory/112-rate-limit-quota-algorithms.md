# 112. Rate Limit and Quota Algorithms

## Status

Locked for implementation blueprint.

## Research Anchors

- OWASP API Security Top 10 2023: https://owasp.org/API-Security/editions/2023/en/0x00-header/
- IETF RateLimit header fields: https://datatracker.ietf.org/doc/rfc9333/

## Decision

Separate API abuse limits, tenant plan quotas, provider source quotas and AI cost budgets. They are related but not interchangeable.

## Limit Types

| Limit | Algorithm | Store |
|---|---|---|
| public API burst | token bucket | Redis |
| public API sustained | sliding window or GCRA | Redis |
| tenant daily scans | fixed window counter with audit | Postgres + Redis cache |
| source provider quota | provider-specific token bucket | Redis + durable quota snapshots |
| AI daily budget | reservation ledger | Postgres |
| webhook outbound delivery | token bucket per destination | Redis |
| backfill concurrency | semaphore per tenant/source | Redis + Postgres state |

## Headers

For public REST, expose standard-ish rate limit information where safe:

- `RateLimit-Limit`;
- `RateLimit-Remaining`;
- `RateLimit-Reset`;
- `Retry-After` for hard throttles.

Do not reveal internal provider quota details that could help abuse or expose other tenants.

## Enforcement Order

1. Authentication.
2. Tenant/account status.
3. API route rate limit.
4. Entitlement/plan limit.
5. Source/provider quota.
6. AI/cost budget.
7. Queue capacity/backpressure.

Return explicit product errors so UI can explain whether the user hit plan limits, source limits, temporary backpressure or invalid configuration.

## Best-Fact Choice

Use different algorithms for different constraints. One global rate limiter cannot protect API abuse, provider quotas, LLM costs and fair scheduling at the same time.

