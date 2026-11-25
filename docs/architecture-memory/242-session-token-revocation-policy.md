# 242 - Session Token Revocation Policy

## Decision

Use short-lived access tokens and revocable refresh/session state.

JWTs may be used as access tokens, but long-lived user sessions must remain revocable through server-side session records or refresh token rotation.

## Sources

- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP REST Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html
- OAuth 2.0 Security Best Current Practice RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- NIST SP 800-63B session guidance: https://pages.nist.gov/800-63-4/sp800-63b.html

## Token Types

Access token:

- short-lived
- bearer or sender-constrained in future high-security tiers
- scoped to API audience
- not used as durable session truth

Refresh token/session:

- stored server-side or tracked by revocable family id
- rotated on use
- reusable detection triggers session family revocation
- device/session metadata tracked

API key:

- separate from user sessions
- tenant scoped
- hashed at rest
- not accepted for interactive user login

## Lifetimes

Default policy:

- access token: minutes, not days
- refresh/session: longer, revocable, tenant-policy controlled
- high-risk action: step-up or recent-auth check
- idle timeout and absolute timeout supported

Exact values are configuration, but indefinite sessions are forbidden.

## Storage

Mobile:

- refresh token/session secret in secure storage
- access token in memory when practical
- clear tokens on logout and device revocation

Web:

- HttpOnly, Secure, SameSite cookies for BFF/session model
- avoid localStorage for high-value session secrets

Backend:

- token hashes or session ids, not plaintext durable tokens
- audit metadata separated from secret material

## Revocation Events

Revoke on:

- logout
- password/authenticator reset
- suspicious token reuse
- tenant admin session revoke
- account disabled
- role/membership removal where needed
- device lost report

Revocation must propagate to WebSocket connections.

## JWT Validation

Required:

- issuer validation
- audience validation
- expiration validation
- key id/JWKS validation
- algorithm allowlist
- clock skew bounds
- token version/session family checks where revocation is needed

Never accept `alg=none`.

## Audit

Record:

- login success/failure
- token refresh family anomaly
- logout
- session revoked
- device added/removed
- step-up completed

Do not log raw tokens.

## Architecture Rule

Stateless access tokens are an optimization.

User session control remains stateful enough to revoke.
