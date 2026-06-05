# 158. Scheduler Simulation Testing

## Status

Locked for scheduler quality baseline.

## Research Anchors

- AWS Well-Architected reliability testing: https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_testing_resiliency.html
- AWS Well-Architected game days: https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_testing_resiliency_game_days.html

## Decision

Build scheduler simulation tests before high-scale production. Fairness and cost behavior must be tested with synthetic and replayed workloads, not only unit tests.

## Simulation Inputs

Simulate:

- many small tenants;
- one large tenant;
- source outage;
- source quota collapse;
- LLM budget exhaustion;
- queue backlog;
- backfill storm;
- mixed plans;
- clock drift/time-zone boundaries;
- retry storm after provider recovery.

## Metrics

Simulation reports:

- max tenant lateness;
- average scan delay by plan;
- skipped jobs by reason;
- queue depth over time;
- source quota utilization;
- AI budget utilization;
- starvation incidents;
- fairness score;
- projected cost.

## Regression Gate

Scheduler changes fail CI if they:

- starve low-tier tenants beyond accepted policy;
- allow one tenant/source to dominate workers;
- overspend budget;
- enqueue work during provider backoff;
- drop accepted work without skip/audit event.

## Best-Fact Choice

The scheduler is too central to validate only in production. Simulation is the cheapest way to catch fairness and cost regressions before real tenants are affected.

