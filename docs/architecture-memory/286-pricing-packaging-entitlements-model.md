# 286 - Pricing Packaging Entitlements Model

## Decision

Product access is controlled by internal entitlements, even when Stripe or another billing provider is used as billing source.

Billing provider entitlements are synchronized into the platform, but application code checks the internal entitlement snapshot.

## Sources

- Stripe Entitlements: https://docs.stripe.com/billing/entitlements
- Stripe Billing: https://docs.stripe.com/billing
- Stripe usage-based billing: https://docs.stripe.com/billing/subscriptions/metered

## Product Plans

Initial plan dimensions:

- number of topics
- enabled source types
- scan frequency minimum
- monthly source item allowance
- monthly AI summary allowance
- historical backfill allowance
- retention period
- seats/users
- webhook endpoints
- export support
- support level

## Entitlement Snapshot

Store per tenant:

```text
tenant_id
plan_id
billing_provider
billing_customer_id
subscription_id
entitlement_version
features[]
limits[]
effective_from
effective_until
source_of_truth_event_id
```

## Internal Check

Use:

```text
EntitlementPort.canUse(tenantId, feature, context)
EntitlementPort.getLimit(tenantId, limitName)
```

Never check Stripe directly in hot paths.

## Stripe Boundary

Stripe may notify feature access through active entitlement events and APIs.

The platform still needs:

- webhook ingestion
- idempotent entitlement projection
- stale entitlement detection
- manual override with audit
- fallback behavior if Stripe is unavailable

## Feature Flags vs Entitlements

Feature flags:

- rollout/control behavior
- experiments
- internal beta access

Entitlements:

- purchased/contracted access
- plan limits
- tenant rights

Do not use feature flags as billing truth.

## Architecture Rule

Billing tells us what was bought.

Entitlements decide what the product allows.
