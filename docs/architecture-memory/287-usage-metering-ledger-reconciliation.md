# 287 - Usage Metering Ledger Reconciliation

## Decision

Maintain an internal immutable usage ledger for product usage.

Stripe meter events are downstream billing submissions, not the canonical source of product usage truth.

## Sources

- Stripe usage-based billing: https://docs.stripe.com/billing/subscriptions/metered
- Stripe usage-based billing concepts: https://docs.stripe.com/billing/subscriptions/usage-based/how-it-works
- Stripe record usage: https://docs.stripe.com/billing/subscriptions/usage-based/recording-usage

## Metered Dimensions

Track:

- source scan executions
- provider API calls
- normalized source items
- comments ingested
- AI input tokens
- AI output tokens
- summaries generated
- digest deliveries
- webhook deliveries
- exports generated
- storage GB-days

## Ledger Entry

```text
usage_event_id
tenant_id
meter_name
quantity
unit
occurred_at
source_type
source_binding_id
job_id
idempotency_key
cost_estimate
billing_period
submitted_to_billing_at
billing_provider_event_id
```

Ledger is append-only. Corrections are compensating entries.

## Billing Submission

Usage submission to Stripe:

- aggregates ledger entries by meter/billing period as required
- uses idempotency keys
- records provider response id
- retries with bounded policy
- does not block product usage recording

## Reconciliation

Daily reconciliation:

- internal ledger totals
- Stripe meter event totals
- invoice line item preview/finalized totals
- tenant-visible usage totals

Differences create reconciliation tasks.

## Late Usage

Late-arriving usage must have policy:

- include in current period
- back-bill if allowed
- write off if below threshold
- admin review

Do not silently mutate prior ledger entries.

## Tenant Visibility

Tenant dashboard shows usage from internal ledger, not only invoice data.

It should make clear whether usage is:

- estimated
- submitted
- invoiced
- adjusted

## Architecture Rule

Billing integrations can be replaced.

The usage ledger is product truth.
