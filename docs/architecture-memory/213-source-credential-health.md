# 213. Source Credential Health

## Status

Locked for source management baseline.

## Research Anchors

- OAuth 2.0 Token Revocation RFC 7009: https://www.rfc-editor.org/rfc/rfc7009
- OAuth 2.0 Security Best Current Practice RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- Reddit API documentation: https://www.reddit.com/dev/api/

## Decision

Source credentials have explicit health state and background validation. Ingestion should not discover revoked/expired credentials only when scans fail.

## States

```text
unknown
validating
valid
refresh_due
refresh_failed_retryable
invalid_grant
scope_insufficient
provider_unavailable
revoked
attention_required
disconnected
```

## Automation

Run credential health jobs to:

- proactively refresh tokens before expiry;
- validate required scopes;
- detect repeated auth failures;
- mark bindings attention-required;
- pause scans when credentials are invalid;
- notify tenant admins where useful.

## Rules

- Never log tokens.
- Store provider account id and scopes for troubleshooting.
- Revoked/invalid credentials stop new fetch jobs.
- Refresh failures have bounded retry.
- User-facing UI explains reconnect action.

## Best-Fact Choice

Credential health is source reliability. Treat it as a first-class state machine instead of scattered exception handling in fetch workers.

