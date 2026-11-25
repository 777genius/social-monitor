# Scheduler Fairness & Backpressure

Date: 2026-05-31
Status: baseline scheduler/backpressure memory

## Decision

Scheduler must be fair across tenants, sources and priorities. Backpressure must be explicit.

Without fairness, one large tenant or expensive source can starve small tenants, cheap sources, fresh scans and compliance jobs.

References:

- AWS Builders Library - Timeouts, retries and backoff with jitter: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/
- AWS Builders Library - Dependency isolation: https://aws.amazon.com/builders-library/dependency-isolation/
- Google SRE - Cascading Failures: https://sre.google/sre-book/addressing-cascading-failures/

## Scheduling Inputs

```text
priority_class
tenant_plan
tenant_budget_remaining
source_type
provider_health
provider_quota_remaining
job_age
freshness_sla
worker_capacity
compliance_hold
```

## Effective Next Run

```text
effective_next_run_at = max(
  user_requested_interval,
  source_min_interval,
  tenant_budget_recovery_at,
  provider_quota_recovery_at,
  circuit_breaker_until,
  worker_capacity_slot,
  compliance_hold_until
)
```

## Priority Rules

```text
P0 compliance deletion
P1 user-triggered refresh
P2 high-priority scheduled scan
P3 normal scans
P4 backfill
P5 enrichment
```

Rules:

- P0 compliance always wins.
- Backfill never competes with fresh scans.
- X jobs cannot starve HN/RSS.
- One tenant cannot consume all connector capacity.
- Source/provider circuit breaker blocks unhealthy jobs.

## Backpressure

When overloaded:

1. stop backfills;
2. reduce X scan frequency;
3. delay low-priority summaries;
4. switch digest summaries to batch;
5. disable expensive provider fallback;
6. keep compliance, HN/RSS and critical alerts alive.

## Retry Policy

Use bounded retries with exponential backoff and jitter. Do not retry indefinitely.

Every retryable operation needs:

- max attempts;
- max retry window;
- idempotency key;
- retry classification;
- DLQ policy;
- observability.

## Locked Decisions

1. Scheduler fairness is required.
2. Compliance and fresh scans outrank backfills.
3. Backpressure is a product behavior, not only queue mechanics.
4. Retries require jitter, bounds and idempotency.
5. X/provider-heavy work must not starve cheap/reliable sources.

