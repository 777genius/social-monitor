# Locked Decisions

## Product

1. The product is a multi-tenant social intelligence platform, not a scraper.
2. Source acquisition must be replaceable through ports/adapters.
3. Do not build core architecture around bot-detection bypass, CAPTCHA bypass, fingerprint spoofing, stealth sessions or account abuse.
4. Browser/scraping collection, if ever used, must be an isolated optional connector, not the core ingestion path.

## Source Order

Build sources in this order:

```text
Hacker News -> RSS/RSSHub -> Reddit official API -> X abstraction -> Telegram -> additional sources
```

Reasons:

- HN has an official public Firebase API and stable IDs.
- RSS is cheap and reliable.
- Reddit has official API/rate limits/compliance requirements.
- X is volatile and cost-sensitive, so it must not block MVP.
- Telegram is permissioned and should come after the core pipeline.

References:

- HN API: https://github.com/HackerNews/API
- RSSHub: https://docs.rsshub.app/
- Reddit Data API: https://support.reddithelp.com/hc/en-us/articles/16160319875092-Reddit-Data-API-Wiki
- X API: https://docs.x.com/x-api
- Telegram Bot API: https://core.telegram.org/bots/api/

## Stack

1. Backend: TypeScript + NestJS monorepo.
2. External API: REST + OpenAPI.
3. Realtime: WebSocket as invalidation/notification channel, not durable truth.
4. Internal sync: gRPC/protobuf.
5. Durable events: Kafka.
6. Task queues: RabbitMQ quorum queues.
7. Storage: PostgreSQL first, Redis for cache/locks/rate limits, S3-compatible raw payload storage.
8. Vectors: pgvector first; dedicated vector DB only when scale requires it.
9. Frontend: Flutter + MobX + feature-scoped Clean Architecture + ports/adapters + presentation stores.
10. UI primitives: `flutter_headless` wrapped through `packages/design_system`.

## Engineering Rules

1. No DTOs in domain or widgets.
2. No provider-specific logic outside connector adapters.
3. No direct feature-to-feature imports.
4. No frontend ownership of backend truth.
5. No queue consumer without idempotency.
6. No summarization without cost tracking and rule/model versioning.
7. No source connector without rate-limit state, health telemetry and certification tests.
8. No unversioned Kafka events.
9. No Redis-as-product-truth.
10. No silent breaking changes in REST/events/gRPC/mobile contracts.

