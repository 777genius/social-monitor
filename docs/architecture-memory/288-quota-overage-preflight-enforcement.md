# 288 - Quota Overage Preflight Enforcement

## Decision

Expensive work requires preflight quota and budget checks before execution.

This is mandatory for AI summaries, high-volume source scans, backfills and webhook/digest fanout.

## Sources

- Stripe usage-based billing: https://docs.stripe.com/billing/subscriptions/metered
- Stripe usage alerts overview: https://docs.stripe.com/billing/subscriptions/metered
- OpenAI rate limits: https://platform.openai.com/docs/guides/rate-limits
- OpenAI Batch API: https://platform.openai.com/docs/guides/batch

## Preflight Flow

```text
request/job
-> estimate units
-> check entitlement
-> check tenant quota
-> check provider budget
-> reserve budget
-> execute work
-> commit actual usage
-> release unused reservation
```

Reservation avoids many workers overspending a tenant budget concurrently.

## Quota Types

Use:

- hard quota
- soft quota with warning
- prepaid credit balance
- overage allowed
- admin override
- trial cap

Each tenant/plan defines allowed behavior.

## Expensive Operations

Require preflight:

- historical backfill
- deep comment ingestion
- X scan
- Reddit high-frequency scan
- AI summary generation
- batch summarization
- export generation
- large webhook replay

## Overage Behavior

If overage is disabled:

- stop scheduling new work
- return Problem Details `quota_exceeded`
- mark source/summary status as quota limited
- notify tenant/admin

If overage is enabled:

- record estimated cost
- continue within max safety cap
- notify when thresholds are crossed

## Race Conditions

Quota checks must be atomic enough for concurrency.

Use ledger/reservation table with constraints or Redis atomic counters backed by ledger reconciliation.

For billing-critical usage, durable DB record wins over cache.

## User Experience

UI must show:

- current usage
- quota
- reset date
- overage state
- estimated cost of action
- upgrade path where appropriate

## Architecture Rule

Do not discover cost overruns after the model/provider call.

Estimate and reserve first.
