# 237 - Redis Cache/Rate/Lease Policy

## Decision

Redis is used for cache, rate limiting, short leases and ephemeral coordination.

Redis is not the source of truth for tenant data, source items, summaries or billing facts.

## Sources

- Redis key eviction: https://redis.io/docs/latest/develop/reference/eviction/
- Redis data eviction policies: https://redis.io/docs/latest/operate/rc/databases/configuration/data-eviction-policies/
- Redis distributed locks: https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/
- Redis rate limiting glossary: https://redis.io/glossary/rate-limiting/

## Use Redis For

- API rate counters
- provider quota windows
- short-lived locks/leases
- cache-aside read models
- WebSocket presence
- idempotency short cache for edge paths
- scheduler coordination hints

## Do Not Use Redis For

- canonical scan cursors
- source credentials
- audit logs
- billing ledger
- summary truth
- raw payload retention
- long-term legal/compliance state

## Cache Policy

Every cache key must have:

- namespace
- tenant segment where relevant
- version prefix
- TTL
- invalidation owner
- maximum payload size

Example:

```text
v1:tenant:{tenant_id}:topic:{topic_id}:feed_page:{cursor_hash}
```

No unbounded key growth.

## Eviction Policy

Production Redis instances used as caches must set `maxmemory` and a deliberate eviction policy.

For cache workloads, `allkeys-lfu` or `allkeys-lru` can be appropriate. For mixed workloads, separate Redis databases/clusters are preferred over one confusing shared policy.

If data must not be evicted, it should not live only in Redis.

## Rate Limiting

Rate limits need atomic operations.

Use Redis scripts or proven library primitives for:

- fixed window
- sliding window
- token bucket
- leaky bucket where needed

Rate-limit keys must expire automatically.

## Lease Policy

Redis locks are leases, not permanent mutexes.

Every lease requires:

- unique random value/fencing token
- TTL
- safe release that checks value
- renewal limit
- fallback if lease expires mid-work
- idempotent protected operation

For critical correctness, prefer Postgres locks/constraints or durable job ownership.

## Failure Behavior

If Redis is unavailable:

- cache misses degrade to DB where safe
- strict rate-limit checks fail closed for abusive/external APIs
- internal non-critical throttles may fail open with alerts
- scheduler leases should stop dispatch rather than duplicate expensive work

Behavior must be explicit per use case.

## Observability

Track:

- hit/miss rate
- evictions
- memory usage
- key count by namespace
- command latency
- connection saturation
- lock acquisition failures
- rate-limit rejections

## Architecture Rule

Redis accelerates and coordinates. It does not own truth.
