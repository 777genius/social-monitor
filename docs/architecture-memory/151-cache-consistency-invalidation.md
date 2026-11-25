# 151. Cache Consistency and Invalidation

## Status

Locked for runtime scaling baseline.

## Research Anchors

- Redis key eviction: https://redis.io/docs/latest/develop/reference/eviction/
- Redis keyspace notifications: https://redis.io/docs/latest/develop/pubsub/keyspace-notifications/

## Decision

Redis is a cache, lock/rate-limit helper and ephemeral coordination layer. It is not the source of truth for product state.

## Cache Classes

| Cache | Owner | TTL |
|---|---|---|
| API response cache | API gateway/read model | seconds to minutes |
| source capability cache | Source Management | minutes to hours |
| quota/rate state | quota manager | policy-defined |
| authorization snapshot | auth layer | short, seconds/minutes |
| feed read model hot items | Feed/Search | short, invalidated by events |
| idempotency fast guard | platform | mirrors durable Postgres record |

## Invalidation Rules

- Prefer write-through invalidation from domain events.
- Use TTL as safety net, not primary correctness.
- Cache keys include tenant scope and data version.
- Do not cache secrets, raw source payloads or authorization decisions for long windows.
- Emit invalidation events for feed/topic/source-binding changes.

## Stampede Controls

Use:

- request coalescing/single-flight for hot keys;
- jittered TTLs;
- stale-while-revalidate for low-risk read models;
- backpressure when cache miss rate spikes.

## Best-Fact Choice

Cache correctness depends on ownership and invalidation paths. A generic shared cache without domain ownership will create cross-tenant leakage and stale product behavior.

