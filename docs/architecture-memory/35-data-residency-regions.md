# Data Residency & Regionalization

Date: 2026-05-31
Status: baseline data residency memory

## Decision

Do not build multi-region SaaS on day one, but include region/residency fields in the data model from the beginning.

## Required Fields

```text
tenant.region
tenant.data_residency_policy
connector_account.region_constraints
raw_payload.storage_region
summary.processing_region
backup.storage_region
```

## Why

Retrofitting data residency later is expensive because raw payloads, summaries, backups, logs, analytics and provider calls may cross boundaries.

## Regionalization Stages

Stage 1:

- single production region;
- region fields present;
- raw payload storage region tracked;
- backup region tracked.

Stage 2:

- regional object storage buckets;
- regional processing constraints for selected tenants;
- source/provider availability by region.

Stage 3:

- dedicated regional deployments;
- tenant pinning;
- region-specific backups and observability.

Stage 4:

- enterprise dedicated environment/region.

## Cross-Region Concerns

Track:

- LLM provider processing region;
- source provider region;
- raw payload region;
- analytics export region;
- backup region;
- support/admin access region.

## Locked Decisions

1. Region fields exist from the beginning.
2. Single-region MVP is acceptable.
3. Raw payload and summary processing regions are tracked.
4. Data residency applies to backups/logs/analytics, not only Postgres.
5. Enterprise dedicated region is later, not MVP.

