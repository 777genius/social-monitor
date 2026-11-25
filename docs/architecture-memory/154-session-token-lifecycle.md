# 154. Session and Token Lifecycle

## Status

Locked for identity baseline.

## Research Anchors

- RFC 9700 OAuth 2.0 Security Best Current Practice: https://www.rfc-editor.org/rfc/rfc9700
- RFC 7009 OAuth 2.0 Token Revocation: https://www.rfc-editor.org/rfc/rfc7009
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html

## Decision

Use short-lived access tokens, rotating refresh tokens and explicit device/session records. Token lifecycle must support revocation, compromise response and mobile realities.

## Session Model

Each login creates a device/session record:

- user id;
- tenant memberships snapshot reference;
- device/app metadata;
- refresh token family id;
- created/last used timestamps;
- revoked timestamp/reason;
- risk flags.

## Token Rules

- Access tokens are short-lived.
- Refresh tokens rotate on use.
- Reuse of old refresh token indicates possible compromise and revokes the token family.
- Logout revokes refresh token/session.
- Password/security reset revokes affected sessions.
- Support/admin sessions have shorter lifetimes and stricter audit.

## Mobile Considerations

- Store tokens only in platform secure storage.
- Handle refresh failure by moving app to signed-out/reauth state.
- Do not store source provider credentials on device.
- Use backend-mediated OAuth for source connections.

## Best-Fact Choice

Long-lived bearer tokens are operationally convenient but high risk. Short access tokens plus rotating refresh tokens and revocation records are the right baseline.

