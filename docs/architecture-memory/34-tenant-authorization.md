# Tenant Authorization & Fine-Grained Access

Date: 2026-05-31
Status: baseline authorization memory

## Decision

Start with app-level RBAC + tenant guards + RLS readiness. Design the model so fine-grained authorization can be added later without rewriting domain.

Do not start MVP with a heavyweight external authorization system unless sharing/enterprise permissions require it immediately.

References:

- OpenFGA: https://openfga.dev/
- OpenFGA FGA docs: https://openfga.dev/docs/fga
- AWS Verified Permissions/Cedar: https://docs.aws.amazon.com/verifiedpermissions/

## MVP Authorization

Use:

```text
tenant_owner
tenant_admin
member
read_only
```

Enforce:

- every product-owned row has `tenant_id`;
- every query is tenant-scoped;
- every command checks membership/role;
- high-risk actions require explicit permissions;
- audit log records high-risk actions.

## Future Fine-Grained Permissions

Resource types:

```text
tenant
topic
source_binding
summary_rule
digest
connector_account
api_key
budget
webhook_endpoint
```

Actions:

```text
view
create
edit
delete
trigger_scan
approve_replay
rotate_credentials
export_data
manage_budget
manage_admins
```

## OpenFGA Later

OpenFGA/Zanzibar-style ReBAC becomes useful when:

- resource sharing becomes complex;
- enterprise teams/groups need granular access;
- cross-tenant/admin relationships emerge;
- user-visible permission explanations are needed.

## RLS

PostgreSQL RLS is a strong defense-in-depth option. It should be prepared for, but not rushed if the team cannot operate it safely.

Reference:

- PostgreSQL RLS: https://www.postgresql.org/docs/17/ddl-rowsecurity.html

## Locked Decisions

1. Every product-owned row has tenant scope.
2. App-level tenant guards are mandatory.
3. High-risk admin actions require explicit permissions and audit.
4. OpenFGA/Cedar are later scale options, not MVP defaults.
5. RLS readiness is required; RLS activation can be phased.

