# 211. API Key Lifecycle

## Status

Locked for external API/security baseline.

## Research Anchors

- OWASP Secrets Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html
- OWASP Key Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html
- OWASP API Security Top 10: https://owasp.org/API-Security/

## Decision

Tenant API keys are scoped credentials with lifecycle, not permanent passwords. Store only hashed/tokenized key material after creation.

## API Key Record

Fields:

- key id;
- tenant id;
- display name;
- prefix;
- hashed secret;
- scopes;
- created by;
- created at;
- last used at;
- expires at optional;
- revoked at/reason;
- rate-limit class;
- allowed origins/IPs optional.

## Rules

- Show full secret only once at creation.
- Use high-entropy random secret.
- Hash secret with a strong keyed or password-hash style approach appropriate for token lookup.
- Support rotation by creating replacement key before revoking old key.
- Scope keys by action/source where possible.
- Log key id/prefix, never full secret.

## MVP Scope Set

Read scopes:

- `read:interests`
- `read:feed`
- `read:summaries`
- `read:delivery_status`
- `read:webhook_endpoints`

Write scopes:

- `write:interests`
- `write:source_bindings`
- `write:scan_requests`
- `write:summaries`
- `write:webhook_endpoints`

Headless MVP clients can create interests, bind sources, set scan policy, request scans, request summaries and manage webhook endpoints with API keys. Workspace role headers remain supported for operator/admin flows.

## Best-Fact Choice

API keys are security principals. They need scopes, audit, rotation and revocation from the first public API release.
