# 100. Architecture Summary

## Status

Canonical compressed summary as of 2026-05-31.

## Product Definition

The product is a multi-tenant social intelligence platform, not a scraper.

Core flow:

```text
tenant -> topics -> source bindings -> scan policies -> ingestion
-> normalization -> dedupe/clustering -> relevance -> summaries
-> digests/alerts/realtime updates -> analytics/governance
```

## Backend

- NestJS TypeScript monorepo.
- DDD, Clean Architecture, SOLID and ports/adapters.
- External REST/OpenAPI 3.1 plus WebSocket.
- Internal gRPC for service-to-service calls.
- Kafka for durable domain/integration events.
- RabbitMQ for work queues and delayed/retry jobs.
- Postgres first system of record.
- Redis for cache, locks and rate/quota state.
- S3-compatible object storage for raw payloads and artifacts.
- pgvector first for embeddings; OpenSearch/vector DB later when scale requires.

## Frontend

- Flutter with feature-scoped Clean Architecture.
- MobX presentation stores.
- Strict `flutter_headless` use through a local design-system wrapper.
- Generated API clients; DTOs do not leak into domain.
- REST is source of truth; WebSocket invalidates/refetches or streams small state changes.

## Source Strategy

Source access is replaceable infrastructure. Preferred order:

1. Hacker News and RSS/RSSHub for early value.
2. Reddit official API where terms and quotas fit.
3. X through abstraction/provider strategy, not as MVP blocker.
4. Telegram later through official/bot/client-safe access model.

No anti-bot bypass architecture. Reliability comes from official APIs, provider abstraction, quotas, backoff, caching, idempotency and graceful degradation.

## Reliability and Governance

- Outbox/inbox and idempotent consumers are mandatory.
- SLOs are per capability/source, not one generic uptime promise.
- Plan limits are backend-enforced entitlements.
- Raw payload retention is short by default.
- AI work is isolated, structured, logged and protected from prompt injection.
- Security baseline includes tenant authorization, audit logs, secrets management, SSRF controls, safe rendering and supply-chain scanning.

## Build Strategy

Start with a modular monolith-style monorepo and a small number of deployables:

- api-gateway;
- realtime-gateway;
- worker-ingestion;
- worker-intelligence;
- worker-notifications;
- scheduler/control-plane.

Split services only when ownership, scale or reliability boundaries justify it.

## Best-Fact Choice

The strongest architecture is not "maximum microservices immediately". It is strict modular boundaries, explicit contracts, replaceable adapters, durable events, controlled costs and a migration path to more deployables when the product proves where scale actually appears.

