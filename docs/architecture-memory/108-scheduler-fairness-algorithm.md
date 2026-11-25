# 108. Scheduler Fairness Algorithm

## Status

Locked for implementation blueprint.

## Research Anchors

- Temporal schedules/API concepts: https://api-docs.temporal.io/
- Google SRE alerting on SLOs: https://sre.google/workbook/alerting-on-slos/

## Decision

Scheduling must be fair by tenant, source and plan. A single noisy tenant or expensive source must not starve the system.

## Inputs

Scheduler decisions use:

- tenant plan limits;
- tenant usage counters;
- source binding state;
- source quota state;
- scan policy interval;
- topic priority;
- last successful scan;
- last failed scan;
- provider backoff state;
- global worker capacity;
- queue lag and SLO burn.

## Algorithm

Use a weighted fair scheduler:

1. Build due candidates by `next_due_at <= now`.
2. Exclude paused/deleted bindings.
3. Exclude candidates blocked by tenant/source quota.
4. Apply provider backoff windows.
5. Compute priority score:

```text
score =
  lateness_weight * lateness_seconds
  + plan_weight
  + topic_priority
  - failure_penalty
  - cost_pressure_penalty
```

6. Select work in round-robin buckets by tenant and source.
7. Reserve quota/budget before enqueueing.
8. Emit skip/reserve/enqueue events for observability.

## Starvation Controls

- Tenant round-robin prevents large tenants from monopolizing workers.
- Source round-robin prevents one degraded provider from filling queues.
- Maximum lateness threshold creates investigation alerts.
- Repeated skips are recorded and visible to users/admins.
- Backfill jobs have lower priority than regular freshness scans by default.

## Temporal Boundary

If Temporal is introduced, use it for durable workflow orchestration and schedules where the lifecycle is long and stateful. Do not put high-volume per-item scheduling into Temporal if simple queue scheduling is enough.

## Best-Fact Choice

The scheduler is a product-critical domain component, not a cron wrapper. It must combine fairness, entitlements, quotas, backpressure and user-visible explanations.

