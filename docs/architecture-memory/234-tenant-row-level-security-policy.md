# 234 - Tenant Row-Level Security Policy

## Decision

Use tenant id constraints in application code and database schema, with PostgreSQL Row-Level Security as defense-in-depth for tenant-owned tables where practical.

RLS is not a substitute for application authorization.

## Sources

- PostgreSQL Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- PostgreSQL roles/privileges: https://www.postgresql.org/docs/current/user-manag.html
- PostgreSQL security labels/permissions overview: https://www.postgresql.org/docs/current/ddl-priv.html

## Tenant-Owned Tables

RLS candidates:

- topics
- source bindings
- scan policies
- normalized source items
- summaries
- digests
- notification preferences
- webhook endpoints
- API keys metadata

Shared/reference tables may not use RLS but must be read-only to application roles where possible.

## Policy Shape

Application sets a transaction-local tenant context:

```sql
SET LOCAL app.tenant_id = '<tenant_uuid>';
```

Policies compare row tenant id to current setting.

All code paths must also include tenant id predicates explicitly for planner clarity and reviewability.

## Default-Deny

When RLS is enabled and no policy exists, PostgreSQL applies default deny for normal access.

This is useful only if migrations and tests verify every required table has correct policies.

## Service Roles

Use separate database roles:

- app runtime
- migration owner
- read-only analytics
- support safe access
- background maintenance

Do not run the application as table owner if owner bypass would weaken RLS assumptions.

## Testing

Required:

- cross-tenant read denial tests
- cross-tenant update/delete denial tests
- missing tenant context tests
- support-role redaction tests
- migration checks that tenant-owned tables have tenant id and policy

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
