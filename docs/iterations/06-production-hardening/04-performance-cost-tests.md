# Iteration 06 / Phase 04 - Performance And Cost Tests

## Objective

Validate MVP capacity and unit economics.

## Steps

1. Define expected MVP load: tenants, topics, scans/day, items/day, summaries/day.
2. Run ingestion load test with HN/RSS fixtures.
3. Run summary cost simulation.
4. Test queue backpressure.
5. Test DB hot queries with EXPLAIN.
6. Validate quota preflight.
7. Document scale risks.
8. Add per-tenant fairness tests for worker queues and provider call budgets.
9. Add per-topic/source budget tests for scan and summary policies.
10. Record usage ledger entries for scans, feed writes, AI calls and delivery attempts.

## MVP Capacity Envelope

Start with an explicit beta envelope. Adjust only with evidence.

| Dimension | Initial Target | Guardrail |
| --- | --- | --- |
| beta tenants | 5-20 | per-tenant quotas enabled |
| topics per tenant | 5-50 | broad/noisy topic warning |
| source bindings per topic | 1-5 | source capability/limit validation |
| scan interval | platform minimum plus provider limits | reject too-frequent scans |
| items per scan | bounded by source policy | truncate with warning before AI |
| summaries per topic/day | bounded by tenant/topic budget | cost preflight |
| delivery attempts/day | bounded by channel policy | suppression/idempotency |

Envelope change rule:

1. Increasing the envelope requires load/cost evidence, quota review and beta ring decision.
2. Decreasing the envelope requires user/support limitation copy and migration path for affected tenants.
3. Unknown provider limits default to conservative intervals and smaller backfill windows.
4. Any source with unstable cost/rate behavior stays behind readiness profile or beta allowlist.

## Degradation Policy

| Pressure | First Degrade | Must Preserve | Blocker If |
| --- | --- | --- | --- |
| scan queue backlog | freshness status and reduced scheduling | cursor safety, idempotency, tenant fairness | jobs silently disappear or duplicate |
| noisy tenant | per-tenant throttling | other tenants' minimum capacity | one tenant starves shared workers/provider quota |
| provider outage/rate-limit | source degraded/paused | existing feed/read models | retries create storm or cost spike |
| AI cost spike | summary quota rejection before provider call | feed availability and existing summaries | model call occurs after quota rejection |
| summary backlog | queued/stale summary state | cited historical artifacts | stale summary shown as fresh |
| DB pressure | reduce expensive filters/exports | core feed/detail reads | tenant-scoped hot query has no index plan |
| delivery retry storm | suppress/quarantine endpoint | scan/feed/summary processing | delivery retries starve core jobs |

## Cost Control Rules

1. Quota preflight runs before provider and AI calls.
2. Usage ledger records accepted, rejected and completed costly work.
3. Retry attempts count against retry budget and may count against cost budget.
4. Broad queries should trigger warning or stricter frequency before beta.
5. Summary input selection enforces token budget before provider call.
6. Noisy tenant cannot starve worker capacity for other tenants.
7. Over-quota response maps to user-visible recovery action.

## Performance Tests

1. topic/source binding CRUD under small beta load
2. scheduled scan burst with fake/HN/RSS fixtures
3. provider outage with retry/circuit breaker behavior
4. feed read pagination and filters
5. summary queue with token/cost budgets
6. WebSocket reconnect/resync under event burst
7. delivery digest retry/DLQ behavior
8. hot query EXPLAIN review for tenant-scoped indexes

## Edge Cases

- One tenant creates too many topics.
- AI cost spikes from long comments.
- Queue depth grows faster than workers.
- Feed search scans too many rows.
- One noisy tenant consumes shared worker capacity.
- Quota is exhausted after job enqueue but before provider call.
- Summary retry would exceed tenant or topic budget.
- Provider rate limit is shared across tenants.
- Feed pagination query slows down as retained items grow.
- Worker scaling increases provider pressure instead of throughput.
- Cost estimate undercounts actual AI provider usage.
- Delivery retry storm competes with scan jobs.
- Beta ring expansion doubles traffic without revisiting envelope.
- Backfill run competes with scheduled scans.
- Dashboard shows aggregate capacity but hides per-tenant unfairness.
- Cost cap is daily but retry storm burns it in first hour.

## Pay Attention

- Load shedding is success if system degrades safely.
- Cost must be visible before paid beta.
- Postgres indexes must match real queries.
- Quota checks should happen before expensive provider or AI calls.
- Fairness matters even when beta has few tenants.
- Capacity envelope is a product promise; document limits in UI/support copy.
- Load shedding must preserve data integrity and tenant isolation.
- Capacity tests should prove safe degradation, not maximum theoretical throughput.
- Do not solve provider limits by adding workers; enforce source budgets first.

## Acceptance Criteria

- MVP capacity envelope documented.
- Hot queries have indexes.
- AI summary has cost cap.
- Over-quota work is rejected before execution.
- Usage ledger and quota rejection evidence are recorded per tenant/topic/source.
- Fairness and backpressure behavior are documented and tested for noisy tenants.
- Degradation policy is tested for queue backlog, provider rate-limit, AI cost spike and noisy tenant.
- Beta ring expansion has a clear capacity review checklist.
