# 289 - Subscription Plan Change Lifecycle

## Decision

Plan changes are explicit lifecycle workflows that update billing, entitlements, quotas and tenant-visible state consistently.

Do not directly mutate entitlements from UI actions without billing/event confirmation path.

## Sources

- Stripe update subscription API: https://docs.stripe.com/api/subscriptions/update
- Stripe subscription schedules: https://docs.stripe.com/billing/subscriptions/subscription-schedules
- Stripe prorations: https://docs.stripe.com/billing/subscriptions/prorations
- Stripe Entitlements: https://docs.stripe.com/billing/entitlements

## Plan Change Types

Support:

- upgrade immediately
- downgrade at period end
- scheduled plan change
- trial to paid
- cancel at period end
- resume subscription
- admin/contract override

## Workflow

```text
change_requested
preview_invoice_or_effect
user/admin_confirmed
billing_provider_updated
webhook_received
entitlement_projection_updated
quota_policy_updated
tenant_notified
audit_recorded
```

## Proration Policy

Proration behavior must be product-defined, not left accidental.

Stripe supports proration controls such as create prorations, always invoice or none. The selected behavior must be explicit per change type.

Suggested:

- upgrades: immediate access, immediate or next-invoice proration depending product policy
- downgrades: usually effective next billing period
- trial to paid: billing confirmation before paid entitlements
- contract overrides: manual audit required

## Entitlement Transition

Entitlements become active only after:

- Stripe webhook confirms subscription/entitlement state, or
- trusted admin override is applied with audit

For UX responsiveness, a short pending state is allowed.

## Failure Handling

If billing update succeeds but entitlement projection fails:

- retry projection
- alert
- show pending billing sync
- do not double-charge

If payment fails:

- apply dunning/grace period policy
- restrict expensive work first
- preserve tenant data

## Architecture Rule

Plan changes are financial state transitions.

They need workflow, audit and reconciliation.
