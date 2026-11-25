# API Gateway & Rate Limits

Date: 2026-05-31
Status: baseline API/rate-limit memory

## Decision

Use layered rate limiting.

Layers:

```text
edge/gateway limit
authenticated tenant/user limit
source/provider quota limit
worker concurrency limit
budget/cost limit
```

Gateway limits protect infrastructure. Application limits protect product economics and source compliance.

## Gateway

Use Gateway API-compatible ingress/gateway in production. Envoy Gateway is a strong candidate because it supports Gateway API and rate limiting patterns.

References:

- Kubernetes Gateway API: https://kubernetes.io/docs/concepts/services-networking/gateway/
- Envoy Gateway rate limiting: https://gateway.envoyproxy.io/docs/concepts/rate-limiting/

## Application Rate Limits

Use Redis-backed token bucket/sliding-window logic for product-level limits:

```text
tenant API requests
scan trigger limits
summary preview limits
provider usage limits
webhook delivery limits
expensive operation preflight
```

Redis is optimization/runtime state, not product truth. Authoritative quota/cost state must be persisted in Postgres ledgers.

Reference:

- Redis rate limiter patterns: https://redis.io/docs/latest/develop/use-cases/rate-limiter/

## HTTP Behavior

Use:

- `429 Too Many Requests` for rate limits;
- `Retry-After` where useful;
- RFC 9457 Problem Details body;
- source/provider quota state in structured error extensions.

References:

- RFC 6585 429: https://www.rfc-editor.org/rfc/rfc6585
- RFC 9457 Problem Details: https://www.rfc-editor.org/rfc/rfc9457

## Abuse Prevention

Primary controls:

- budgets;
- quotas;
- idempotency;
- email verification before expensive features;
- anomaly detection;
- admin kill switches.

CAPTCHA/Turnstile is secondary and should be used only on suspicious flows, not as the primary defense.

Reference:

- Cloudflare Turnstile: https://developers.cloudflare.com/turnstile/

## Locked Decisions

1. Use layered rate limits.
2. Gateway limits and product limits are separate.
3. Redis may support rate limiting but is not authoritative cost truth.
4. Expensive operations require preflight budget checks.
5. CAPTCHA is secondary; budget/quota/idempotency are primary.

