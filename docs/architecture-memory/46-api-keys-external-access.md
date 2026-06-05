# API Keys & External Access

Date: 2026-05-31
Status: baseline API key memory

## Decision

API keys are for external integrations, not for interactive user sessions.

Use OAuth/OIDC sessions for users. Use scoped API keys or future OAuth client credentials for machine-to-machine integrations.

References:

- OWASP REST Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- OWASP API Security: https://owasp.org/API-Security/
- RFC 9449 OAuth DPoP: https://www.ietf.org/rfc/rfc9449.html

## API Key Storage

Store only hashed API keys.

Required fields:

```text
api_key_id
tenant_id
name
key_prefix
key_hash
scopes
created_by
created_at
last_used_at
expires_at nullable
revoked_at nullable
rate_limit_policy
allowed_ips nullable
```

The full API key is shown only once at creation.

## Scopes

Initial scopes:

```text
feed:read
summaries:read
digests:read
events:read
webhooks:manage
scan_runs:trigger
```

Do not allow API keys to:

- rotate connector credentials;
- export all tenant data by default;
- delete tenant data;
- manage billing/admins;
- bypass budgets.

## Authentication

MVP:

- API key over TLS in `Authorization: Bearer`.
- Hash and compare server-side.
- Tenant scoped.
- Rate limited.

Later:

- OAuth client credentials for partners.
- DPoP/mTLS for high-security integrations if needed.

## Locked Decisions

1. API keys are hashed at rest.
2. API keys are scoped and tenant-bound.
3. API keys cannot bypass budget/authorization.
4. Full API key is shown only once.
5. High-security partner auth can evolve to OAuth client credentials/DPoP later.

