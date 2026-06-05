# 290 - Billing Invoicing Tax Audit Policy

## Decision

Stripe or another billing provider may generate invoices and calculate taxes, but the platform records billing-relevant audit events and release/usage evidence.

Finance state is not debug-log state.

## Sources

- Stripe invoices: https://docs.stripe.com/invoicing
- Stripe taxes on invoices: https://docs.stripe.com/invoicing/taxes
- Stripe tax rates: https://docs.stripe.com/billing/taxes/tax-rates
- Stripe Automatic Tax: https://docs.stripe.com/tax

## Billing Events

Audit:

- customer created/linked
- subscription created/changed/canceled
- entitlement updated
- payment failed/succeeded
- invoice finalized
- invoice paid/voided/uncollectible
- usage submitted
- usage correction
- tax configuration changed
- manual credit/adjustment

## Invoice Boundary

Invoice PDF/hosted invoice may live in billing provider.

Platform stores references:

```text
invoice_id
tenant_id
billing_provider_invoice_id
status
amount_due
amount_paid
currency
period_start
period_end
tax_amount
invoice_url
created_at
```

Do not duplicate full financial ledger unless building accounting features.

## Tax Policy

Tax handling depends on jurisdiction, customer location and product taxability.

Use billing provider tax features where appropriate, but record:

- tax mode
- customer tax location basis
- tax exempt status
- tax ids
- applied rates/automatic tax flag

Tax configuration changes require finance/admin audit.

## Evidence

For each invoice period, link:

- usage ledger totals
- Stripe meter submissions
- invoice line items
- credits/adjustments
- entitlement snapshot
- plan/pricing version

## Access Control

Billing data access is limited:

- tenant owner/billing admin
- internal finance/support roles with approval
- audit logged

Do not expose payment method details beyond safe provider-returned summaries.

## Architecture Rule

Billing is a regulated business process.

Treat invoices, usage and tax evidence as auditable records, not UI conveniences.
