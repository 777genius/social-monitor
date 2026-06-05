# Enterprise Identity & Tenant Lifecycle

Date: 2026-05-31
Status: baseline identity/tenant memory

## Decision

Do not build a custom identity provider.

Use standards-based identity:

- OIDC/OAuth 2.0 for authentication;
- Authorization Code + PKCE for public clients;
- SCIM later for enterprise user provisioning;
- SAML only through an identity broker if enterprise customers require it.

References:

- OpenID Connect Core 1.0: https://openid.net/specs/openid-connect-core-1_0-18.html
- OAuth 2.0 Security BCP RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- PKCE RFC 7636: https://www.rfc-editor.org/rfc/rfc7636
- SCIM Protocol RFC 7644: https://datatracker.ietf.org/doc/rfc7644/

## Internal Identity Model

Keep internal user/tenant/membership model independent from auth provider.

Required:

```text
users
tenant_memberships
identity_provider_accounts
groups
group_memberships
role_assignments
provisioning_events
user_sessions
refresh_tokens
login_events
```

## Session Lifecycle

States:

```text
active
expired
revoked_by_user
revoked_by_admin
rotated
suspicious
```

Required behavior:

- short-lived access tokens;
- refresh token rotation;
- device/session list;
- revoke session;
- revoke all sessions;
- admin revoke user sessions;
- suspicious refresh-token reuse detection.

## Admin Permissions

MVP roles:

```text
tenant_owner
tenant_admin
member
read_only
```

Later roles:

```text
billing_admin
source_admin
security_admin
compliance_admin
ops_admin
```

High-risk permissions must be separately auditable:

- rotate connector credential;
- delete source account;
- trigger backfill;
- approve replay;
- change budget;
- enable X provider fallback;
- change summary model policy;
- export tenant data;
- delete tenant data;
- invite admin;
- revoke sessions.

## Tenant Lifecycle

States:

```text
trial
active
past_due
suspended
deletion_requested
deleting
deleted
legal_hold
```

Rules:

- `past_due` pauses expensive jobs but keeps deletion/export flows active.
- `suspended` stops scheduled scans but keeps compliance paths active.
- `deletion_requested` stops scans, revokes connector credentials where possible and starts deletion workflow.
- `legal_hold` blocks purge but restricts destructive actions.

Billing/account state must not break compliance deletion/export paths.

## Locked Decisions

1. Do not build custom IdP.
2. Keep internal membership model independent from auth provider.
3. Design user/group model for future SCIM.
4. Session lifecycle is auditable and revocable.
5. Admin permissions are split by risk.
6. Tenant lifecycle includes billing, suspension, deletion and legal hold states.

