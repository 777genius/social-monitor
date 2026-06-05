# Support & Admin Access

Date: 2026-05-31
Status: baseline support/admin access memory

## Decision

Support/admin access must be explicit, scoped, time-bound and audited.

Do not give broad database access as the normal support workflow.

## Support Access Model

Required:

```text
support_access_grants
  tenant_id
  support_user_id
  granted_by
  reason
  scope
  starts_at
  expires_at
  revoked_at
```

Scopes:

```text
view_config
view_scan_runs
view_delivery_status
view_cost_summary
view_audit_summary
impersonation_for_debug_later_optional
```

Avoid support access to:

- connector secrets;
- raw source payloads by default;
- full prompt/source text unless needed and approved;
- billing payment details.

## Break-Glass

Break-glass access is for emergencies only.

Requires:

- reason;
- time limit;
- elevated audit;
- post-access review;
- alert to security/owner.

## Audit Events

Record:

- support access granted;
- support access used;
- support access revoked;
- break-glass activated;
- data export viewed/downloaded;
- connector credential viewed/rotated.

## Locked Decisions

1. Support/admin access is not broad DB access.
2. Support access is scoped and time-bound.
3. Break-glass is audited and reviewed.
4. Connector secrets are not visible to support by default.
5. Support actions are first-class audit events.

