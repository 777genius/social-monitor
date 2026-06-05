# 119. Source OAuth and Credential Flows

## Status

Locked for implementation blueprint.

## Research Anchors

- RFC 8252 OAuth 2.0 for Native Apps: https://www.rfc-editor.org/rfc/rfc8252
- OAuth 2.0 PKCE RFC 7636: https://www.rfc-editor.org/rfc/rfc7636
- OAuth 2.1 draft: https://datatracker.ietf.org/doc/draft-ietf-oauth-v2-1/

## Decision

Use Authorization Code with PKCE for mobile/native OAuth flows. Do not embed source provider client secrets in Flutter.

## Source Connection Flow

```text
Flutter -> backend create connection intent
backend -> returns auth URL/state/PKCE metadata
Flutter -> opens system browser/native auth session
provider -> redirects to registered callback
backend -> validates state, exchanges code, stores encrypted tokens
backend -> returns source binding status
Flutter -> refreshes binding state
```

For web admin, use the same backend-owned callback and state validation.

## Credential Storage

Store:

- encrypted access token;
- encrypted refresh token where provided;
- provider account id;
- scopes granted;
- expiry;
- rotation/version metadata;
- last validation status.

Never store source credentials in Flutter local storage.

## Refresh Policy

- Refresh proactively before expiry where provider supports it.
- On refresh failure, mark binding `credential_attention_required`.
- Do not retry invalid grants forever.
- Emit audit event for connect, disconnect, refresh failure and scope change.

## Best-Fact Choice

Source credentials are high-value tenant assets. Backend-controlled OAuth callbacks, PKCE, encrypted storage and explicit credential states are mandatory before multi-user scale.

