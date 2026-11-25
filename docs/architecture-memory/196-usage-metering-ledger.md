# 196. Usage Metering Ledger

## Status

Locked for billing/FinOps baseline.

## Research Anchors

- Stripe usage-based billing: https://docs.stripe.com/billing/subscriptions/usage-based/how-it-works
- Stripe recording meter events: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage-api

## Decision

Keep an internal usage ledger as source of truth for product usage. External billing providers receive derived meter events and are reconciled against the internal ledger.

## Metered Dimensions

Initial meters:

- scans attempted;
- scans completed;
- normalized items;
- summary jobs;
- LLM input/output tokens;
- embeddings generated;
- backfill items/windows;
- digest deliveries;
- webhook deliveries;
- storage retained by class.

## Ledger Rules

- Usage events are append-only.
- Events include tenant, source kind, plan, operation, unit, quantity, timestamp and idempotency key.
- Expensive work reserves budget before execution and records actual usage after execution.
- Billing export is asynchronous and retryable.
- Provider billing event ids are stored for reconciliation.

## Reconciliation

Run daily:

- internal ledger totals vs billing provider summaries;
- invalid/rejected provider meter events;
- plan/entitlement mismatches;
- tenant-visible usage vs billable usage.

## Best-Fact Choice

Do not make Stripe or any billing provider the only usage source of truth. Product limits, support, FinOps and billing all need the same internal ledger.

