# Billing, Entitlements & FinOps

Date: 2026-05-31
Status: baseline billing memory

## Decision

Billing and entitlements must be internal-first for runtime decisions.

Stripe or another billing provider can handle payments, invoices, subscriptions and metered billing, but product runtime must not depend on a billing provider as the real-time source of truth for expensive operations.

## Internal Source of Truth

Maintain:

```text
usage_ledger
cost_ledger
budget_reservations
entitlement_snapshots
tenant_limits
plan_features
```

Runtime flow:

```text
preflight entitlement/quota/budget
-> reserve budget
-> execute operation
-> commit usage/cost
-> sync aggregate/idempotent billing event
```

## Expensive Operation Preflight

Required before:

- X provider scan;
- large Reddit backfill;
- summary preview;
- digest generation;
- embeddings generation;
- replay/backfill;
- webhook replay at scale.

## Stripe Role

Stripe can be used for:

- customer/subscription lifecycle;
- invoices/payments;
- active entitlements sync;
- metered billing export/sync.

But internal product state must decide whether an operation can run now.

References:

- Stripe Entitlements: https://docs.stripe.com/billing/entitlements
- Stripe Meter Events: https://docs.stripe.com/api/v2/billing/meter-event/create

## Cost Ledger

Minimum fields:

```text
tenant_id
user_id nullable
topic_id nullable
source_type
provider
operation_type
units
unit_cost
total_cost_usd
model nullable
connector_run_id nullable
summary_job_id nullable
occurred_at
```

## Locked Decisions

1. Internal ledger is runtime source of truth.
2. Billing provider is sync/payment layer, not realtime gatekeeper.
3. Expensive operations require budget reservation.
4. Every provider/LLM cost must be attributable to tenant and operation.
5. Backfills/replays require max-cost guardrails.

