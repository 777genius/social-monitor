# Source Credentials & OAuth Lifecycle

Date: 2026-05-31
Status: baseline source credential memory

## Decision

Use OAuth Authorization Code + PKCE for user-connected source accounts wherever supported.

Do not collect source passwords. Do not store source/provider credentials on Flutter/mobile.

References:

- OAuth 2.0 Security BCP RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- PKCE RFC 7636: https://www.rfc-editor.org/rfc/rfc7636

## Connector Account Model

Required fields:

```text
tenant_id
user_id nullable
source_type
provider
external_account_id
display_name
scopes
status
credential_version
last_used_at
last_refresh_at
refresh_error_count
revoked_at
created_at
updated_at
```

Encrypted credential payload:

```text
access_token encrypted
refresh_token encrypted nullable
expires_at nullable
token_type
scope
kms_key_id
encryption_context
```

## Source Account States

```text
pending_connection
active
refresh_needed
refresh_failed_retryable
reauth_required
rate_limited
degraded
disabled_by_user
disabled_by_admin
revoked
deleted
```

## Refresh Failure Policy

Token refresh failure must not silently kill monitoring.

Behavior:

- retry transient refresh failures with backoff;
- circuit-break repeated failures;
- mark source binding/account as degraded;
- emit `connector.account.auth_failed.v1`;
- pause affected scans only;
- keep other sources running.

## User UX

User can:

- connect source account;
- see connected scopes;
- see health/degraded reason;
- reconnect/reauthorize;
- disable source;
- delete source account;
- rotate/revoke credentials where supported.

## Deletion Behavior

Deleting a source account should:

- stop future scans;
- revoke token where platform supports it;
- keep historical derived data unless user requests deletion or source policy requires purge;
- create audit event.

## Locked Decisions

1. No source password collection.
2. No source/provider credentials in Flutter/mobile.
3. OAuth + PKCE is preferred for user-connected accounts.
4. Auth failures degrade only affected source/account, not whole tenant.
5. Source credential lifecycle is auditable.

