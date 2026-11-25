# 245 - Auth Security Testing Checklist

## Decision

Authentication, session and authorization features require dedicated security tests before release.

Generic unit tests are not enough for auth correctness.

## Sources

- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- OWASP Session Management Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html
- OWASP WebSocket Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html
- OAuth 2.0 Security BCP RFC 9700: https://www.rfc-editor.org/rfc/rfc9700

## OIDC/OAuth Tests

Required:

- invalid state rejected
- invalid nonce rejected
- wrong redirect URI rejected
- missing PKCE verifier rejected
- wrong PKCE verifier rejected
- expired auth code rejected
- replayed auth code rejected
- issuer mismatch rejected
- audience mismatch rejected

## Session Tests

Required:

- access token expires
- refresh token rotates
- refresh token reuse revokes family
- logout revokes session
- admin revocation disconnects active sessions
- disabled user cannot refresh
- role removal updates authorization
- raw tokens never appear in logs

## Authorization Tests

Required:

- cross-tenant read denied
- cross-tenant update denied
- object id tampering denied
- missing permission denied
- owner/admin/analyst/viewer matrix
- support access scope enforced
- export/delete sensitive actions require recent auth

## WebSocket Tests

Required:

- unauthenticated handshake rejected
- expired token rejected
- unauthorized subscription rejected
- authorized subscription accepted
- revoked session disconnects or blocks messages
- malformed message rejected
- oversized message rejected
- rate limit enforced

## API Security Tests

Required:

- OpenAPI declares auth requirements
- unauthenticated endpoints are explicit
- 401 vs 403 behavior consistent
- no sensitive data in error bodies
- pagination cannot bypass tenant filter
- filters cannot bypass ownership

## Mobile Tests

Required:

- logout clears secure storage
- session refresh failure returns to auth state
- wrong environment callback rejected
- app does not store client secret
- screenshots/logs do not expose tokens

## CI Gates

Auth-related PRs must run:

- unit tests
- integration tests
- contract tests
- negative authorization tests
- lint rule for forbidden token logging where possible

High-risk auth changes require manual security review.

## Architecture Rule

For auth, negative tests are as important as positive tests.

If the test suite only proves legitimate access works, it is incomplete.
