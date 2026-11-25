# Iteration 01 / Phase 03 - Database And Migrations

## Objective

Create the first Postgres schema with tenant isolation and migration discipline.

## Steps

1. Choose Prisma default access plus raw SQL boundary.
2. Create tables: tenants, users, memberships, topics, source_bindings, scan_policies, source_items, summaries.
3. Add tenant_id to every tenant-owned table.
4. Add UUIDv7 id generation strategy.
5. Add basic indexes for tenant + created_at + status.
6. Add migration tests with Testcontainers.
7. Add RLS plan or initial policies if ready.
8. Define schema ownership by bounded context.
9. Add outbox, inbox and idempotency tables before real workers.
10. Define additive migration policy for MVP.

## Data Ownership Rules

- Identity/Tenancy owns tenants, users, memberships and auth/session references.
- Topic/Monitoring owns topics, source bindings and scan policies.
- Ingestion owns scan jobs, cursors, normalized source items and raw payload references.
- Feed owns dedupe/read-model records derived from source items.
- Summary owns summary requests, artifacts, evidence links and feedback.
- Delivery owns notifications, digests, webhook/API-key metadata and delivery attempts.
- Billing/Usage owns quota configuration and usage ledger entries.

Shared tables are allowed only when ownership and write responsibility are explicit.

## MVP Migration Rules

- Prefer additive migrations: add nullable column, backfill, then enforce constraint.
- Do not drop or rename fields used by generated clients, workers or event consumers without compatibility plan.
- Every tenant-owned unique index must include tenant/workspace scope unless it is intentionally global.
- Every cursor/raw metadata shape that may change needs version field.
- Migration test must cover clean database and upgraded seeded database.
- Long-running backfills are deferred unless required for MVP data correctness.

## Deploy Compatibility Rules

1. Migrations must support API and workers running old code during the deploy window.
2. Additive columns start nullable or with safe defaults; constraints are enforced only after backfill and code compatibility.
3. Destructive migrations require explicit rollback/mitigation and are normally deferred until after beta.
4. Worker-readable payloads such as cursors, raw metadata and capability snapshots need `schema_version`.
5. Outbox/inbox payload changes must keep old event replay possible or provide a bounded replay/migration plan.
6. Index changes must be tested against tenant-scoped hot queries and not block critical tables during beta.
7. Backfill jobs must be tenant-scoped, resumable, observable and quota-aware if they touch source/summary data.

## Migration Compatibility Matrix

| Change | MVP Approach | Evidence |
| --- | --- | --- |
| add column | nullable/default first | clean and upgraded migration |
| add required field | add nullable, backfill, validate, enforce | seeded upgrade plus backfill fixture |
| rename column | add new, dual-write/read, migrate, remove later | compatibility plan, normally post-MVP removal |
| change cursor payload | version payload and adapter parser | old/new cursor fixture |
| change outbox event payload | new event version or optional field | replay and consumer compatibility test |
| delete/tombstone data | lifecycle policy first | retention/delete/export/replay fixture |

## Data Lifecycle Columns

Tenant-owned and operational tables should include lifecycle fields where relevant:

- `tenant_id` and `workspace_id` for scope.
- `created_at`, `updated_at` and `deleted_at` or explicit status for soft-delete/tombstone behavior.
- `retention_class` or documented table-level retention owner.
- `schema_version` for cursor/raw metadata/source capability snapshots.
- `correlation_id` and `causation_id` for operational rows.
- `idempotency_key` for commands, jobs, events and delivery attempts.

Rules:

1. Do not hard-delete rows that may still be required for audit, idempotency, citation or replay without a retention decision.
2. Read models may hide/tombstone data before physical deletion.
3. Summary citations must be resilient to raw source payload deletion.
4. Operational table retention must not break retry, replay, DLQ repair or support triage.
5. Every destructive migration needs retention, export/delete and replay impact review.

## Edge Cases

- Missing tenant_id on read model.
- Unique constraint not tenant-scoped.
- Migration locks hot table.
- Raw provider payload stored in canonical table.
- Worker writes using old schema while migration is running.
- Idempotency key is global when it should be tenant/workspace scoped.
- Outbox event references data before transaction commits.
- Retention job deletes source item still referenced by summary citation.
- Hard delete removes idempotency record and allows duplicate delivery/scan.
- Backfill changes cursor schema without versioned migration.
- API writes new column while worker still reads old schema.
- Old outbox event is replayed after new schema deploy.
- Required constraint is applied before seeded data is backfilled.
- Index migration locks table during beta scan burst.

## Pay Attention

- Keep raw payload in object storage pointer, not main table.
- Use timestamptz and UTC.
- Domain invariants also need DB constraints where possible.
- Read models can denormalize, but must still preserve tenant/workspace scope.
- Database constraints protect invariants; domain rules explain them.
- Schema compatibility must protect running workers, not only API controllers.
- Migration rollback can be mitigation/pause, but it must be explicit.

## Acceptance Criteria

- Migrations run on empty DB.
- Migrations run on seeded DB.
- Cross-tenant uniqueness works.
- Repository integration tests pass.
- Outbox/inbox/idempotency tables exist with ownership and retention policy.
- Migration policy is documented enough for Iteration 02 workers to depend on it.
- Data lifecycle fields and retention owners are defined for MVP tables.
- Deploy compatibility and migration matrix are documented for API, workers, outbox/inbox and generated consumers.
