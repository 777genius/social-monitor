# FinOps & Unit Economics

Date: 2026-05-31
Status: baseline FinOps memory

## Decision

Track unit economics as product data from the beginning.

For this product, "cost per tenant" is not enough. Costs must be attributable to source, topic, connector run, summary job, model and digest.

References:

- FinOps Unit Economics: https://www.finops.org/framework/capabilities/unit-economics/
- Introduction to Cloud Unit Economics: https://www.finops.org/wg/introduction-cloud-unit-economics/

## Unit Metrics

Track:

```text
cost_per_tenant_day
cost_per_topic_day
cost_per_source_binding_day
cost_per_1000_items_discovered
cost_per_1000_items_normalized
cost_per_summary
cost_per_digest
cost_per_webhook_delivery
cost_per_relevant_item
cost_per_saved_summary
```

## Cost Dimensions

```text
tenant_id
topic_id nullable
source_type
provider
operation_type
connector_run_id nullable
summary_job_id nullable
model nullable
worker_type nullable
environment
```

## Product Decisions Powered By Unit Economics

- plan limits;
- scan frequency tiers;
- X enablement;
- summary preview quotas;
- backfill pricing;
- provider fallback policy;
- model routing;
- trial limits.

## Rules

- cost estimates are checked before expensive operations;
- actual cost is committed after operation;
- estimate vs actual variance is tracked;
- runaway cost triggers kill switch/alert.

## Locked Decisions

1. Unit economics are product data.
2. Cost must be attributed below tenant level.
3. Expensive operations require estimate and reservation.
4. Unit economics influence plan limits and source availability.
5. Cost runaway is an incident class.

