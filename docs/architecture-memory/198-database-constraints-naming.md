# 198. Database Constraints and Naming

## Status

Locked for database design baseline.

## Research Anchors

- PostgreSQL constraints: https://www.postgresql.org/docs/current/ddl-constraints.html
- PostgreSQL indexes: https://www.postgresql.org/docs/current/indexes.html

## Decision

Database constraints enforce data invariants that must hold regardless of which service path writes data. Names must be explicit and predictable for migrations, errors and support.

## Naming

Use:

```text
pk_<table>
fk_<table>__<ref_table>__<column>
uq_<table>__<columns>
idx_<table>__<columns>
chk_<table>__<rule>
excl_<table>__<rule>
```

Examples:

```text
uq_normalized_item__tenant_source_external_id
idx_scan_run__tenant_binding_started_at
chk_scan_policy__interval_within_bounds
```

## Required Constraints

- tenant-scoped uniqueness for external source ids;
- foreign keys for canonical ownership where lifecycle allows;
- check constraints for bounded enum-like values where stable;
- unique idempotency keys;
- unique cursor state per source binding;
- ledger idempotency keys.

## Rules

- Do not rely only on application validation for uniqueness/invariants.
- Constraint violations map to stable product errors.
- Indexes need query/use-case justification.
- Partial indexes are allowed for hot states like active bindings or pending jobs.

## Best-Fact Choice

Application code changes faster than data. Database constraints are the last line of defense against invalid state from workers, webhooks and future services.

