# 174. Tenant Sharding Roadmap

## Status

Locked for multi-tenancy scalability baseline.

## Research Anchors

- AWS SaaS tenant isolation strategies: https://docs.aws.amazon.com/whitepapers/latest/saas-tenant-isolation-strategies/core-isolation-concepts.html
- AWS SaaS storage partitioning models: https://docs.aws.amazon.com/whitepapers/latest/multi-tenant-saas-storage-strategies/saas-partitioning-models.html
- PostgreSQL partitioning: https://www.postgresql.org/docs/current/ddl-partitioning.html

## Decision

Start with pooled multi-tenant Postgres and strict tenant isolation in application/data model. Keep a path to bridge/silo models for high-value or high-scale tenants.

## Models

| Model | Use |
|---|---|
| pooled | default shared infrastructure and schema |
| bridge | tenant group/database partition for scale or compliance |
| silo | dedicated resources for enterprise/regulatory/high isolation |

## Sharding Triggers

Consider bridge/silo when:

- one tenant dominates storage or workload;
- tenant requires data residency/isolation contract;
- noisy-neighbor controls are insufficient;
- backup/restore window becomes tenant-specific;
- database maintenance affects too many tenants;
- custom retention or compliance needs diverge materially.

## Design Now

- Every tenant-owned row has `tenant_id`.
- Internal APIs always carry tenant context.
- IDs do not encode single database assumptions.
- Background jobs include tenant id.
- Exports/imports can move tenant data.
- Metrics/costs are tenant-attributable.

## Best-Fact Choice

Do not start with per-tenant databases for a personal/MVP product. Do design pooled tenancy so a large tenant can be moved later without rewriting every table and job.

