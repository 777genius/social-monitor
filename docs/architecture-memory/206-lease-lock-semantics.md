# 206. Lease and Lock Semantics

## Status

Locked for runtime/concurrency baseline.

## Research Anchors

- PostgreSQL explicit locking: https://www.postgresql.org/docs/current/explicit-locking.html
- PostgreSQL SELECT locking clauses: https://www.postgresql.org/docs/current/sql-select.html
- Redis distributed locks: https://redis.io/docs/latest/develop/clients/patterns/distributed-locks/

## Decision

Use database transactions and row locks for correctness-critical state transitions. Use Redis leases only for short-lived coordination where duplicate execution is tolerable or fenced by durable state.

## Lock Choices

| Need | Preferred Tool |
|---|---|
| claim due scan jobs | Postgres `FOR UPDATE SKIP LOCKED` |
| reserve quota/budget | Postgres transaction + constraints |
| idempotency command record | Postgres unique constraint/transaction |
| rate limit counters | Redis |
| short worker singleton | Redis lease with TTL + durable guard |
| cross-service business invariant | Postgres/domain state, not Redis-only lock |

## Lease Rules

- Leases have TTL and owner id.
- Long work renews lease only if still owner.
- Durable state checks remain source of truth.
- Use fencing tokens for side effects where stale lease owners could write late.
- Treat Redis lock loss as possible, not impossible.

## Best-Fact Choice

Redis locks are useful coordination hints. Postgres transactions, constraints and idempotency records are the correctness boundary.

