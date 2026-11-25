# 234 - Tenant Row-Level Security Policy

## Decision

Use tenant id constraints in application code and database schema together
with forced PostgreSQL Row-Level Security for every table classified as
tenant-owned by `ops/security/tenant-db-guard-contract.json`.

RLS is not a substitute for application authorization.

## Sources

- PostgreSQL Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PostgreSQL roles/privileges: https://www.postgresql.org/docs/current/user-manag.html
- PostgreSQL security labels/permissions overview: https://www.postgresql.org/docs/current/ddl-priv.html

## Enforced Inventory

The contract is authoritative. It classifies:

- tenant roots;
- direct tenant/workspace tables;
- tenant-scoped system tables;
- indirectly owned secret/replay tables;
- the small reviewed set of shared reference tables.

The migration enables and forces RLS and installs one explicit
`tenant_isolation` policy per protected table. Missing context denies access.

## Context Shape

Application sets a transaction-local tenant context:

```sql
SELECT set_config('social_monitor.tenant_id', '<tenant_uuid>', true);
SELECT set_config('social_monitor.workspace_id', '<workspace_uuid>', true);
```

The centralized Prisma runtime boundary sets these values before executing a
protected query or transaction. Request and validated queue/event boundaries
use `AsyncLocalStorage` so id-only repository calls retain their scope.

All code paths must also include tenant id predicates explicitly for planner clarity and reviewability.

## Default-Deny

When RLS is enabled and no policy exists, PostgreSQL applies default deny for normal access.

This is useful only if migrations and tests verify every required table has correct policies.

## Service Roles

Production uses separate database identities:

- `social_monitor_app` for API and ordinary tenant-scoped access;
- `social_monitor_system_app` for reviewed workers;
- `social_monitor_tenant_system_runtime` as a NOLOGIN capability inherited
  only by the worker login;
- `social_monitor_public_schema_owner` as the NOLOGIN ordinary table owner;
- the existing migration and reader-summary protected roles.

`social_monitor.system_access=true` is effective only when `current_user`
inherits the system capability. `application_name` is observability metadata,
not authorization, because a PostgreSQL client can change it.

The API receives `DATABASE_URL`. Reviewed workers receive the separately
stored `SYSTEM_DATABASE_URL`. Deploy must fail closed if either login is
missing, unsafe, or the worker login lacks its reviewed capability.

## Testing

Required:

- cross-tenant read denial tests
- cross-tenant update/delete denial tests
- missing tenant context tests
- support-role redaction tests
- migration checks that tenant-owned tables have tenant id and policy
- API spoofing of `application_name` plus `system_access` still sees zero rows
- system worker sees cross-tenant and global outbox work
- transaction-local context does not leak through pooled connections

Executable gates:

```sh
npm run check:tenant-db-guards
TENANT_RLS_TEST_ADMIN_DATABASE_URL=... npm run check:tenant-rls-postgres
READER_SUMMARY_PUBLICATION_TEST_ADMIN_DATABASE_URL=... \
  npm run check:reader-summary-publication-postgres
```

## Rollout

Before the migration:

1. provision the safe LOGIN role `social_monitor_system_app`;
2. store its DSN as `SYSTEM_DATABASE_URL` outside git;
3. run the publication pre-migration bootstrap, which validates both runtime
   roles, grants the regular runtime role and the system capability to the
   worker login, and moves ordinary table ownership to the NOLOGIN owner;
4. deploy migrations, run the post bootstrap and both PostgreSQL gates;
5. start the API with `DATABASE_URL`, then workers with
   `SYSTEM_DATABASE_URL`.

Do not reuse the API credential for `SYSTEM_DATABASE_URL`. If worker
credentials are unavailable, keep workers stopped rather than granting the API
system capability.

## Performance

RLS can affect query planning and index usage.

Tenant-owned hot tables need indexes starting with or including `tenant_id` where query patterns require it.

## Operational Caveats

RLS does not cover:

- object storage access
- external search indexes
- logs
- analytics exports
- admin tools unless they use database policies

Those systems need separate tenant isolation controls.

## Architecture Rule

Tenant isolation is layered:

```text
API auth -> application authorization -> tenant predicates -> DB constraints/RLS -> audit
```

No single layer is trusted alone.
