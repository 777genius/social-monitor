# 241 - User Auth OIDC/PKCE Policy

## Decision

User authentication uses OpenID Connect for identity and OAuth 2.0 Authorization Code flow with PKCE for public clients.

The product must not invent its own password/session protocol unless there is a specific future requirement and security review.

## Sources

- OpenID Connect Core 1.0: https://openid.net/specs/openid-connect-core-1_0.html
- OAuth 2.0 Security Best Current Practice RFC 9700: https://www.rfc-editor.org/rfc/rfc9700
- PKCE RFC 7636: https://www.rfc-editor.org/rfc/rfc7636
- OWASP Authentication Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html
- NIST SP 800-63B: https://pages.nist.gov/800-63-4/sp800-63b.html

## Client Types

Flutter mobile app:

- public OAuth client
- Authorization Code + PKCE
- system browser/custom tab/SFAuthenticationSession equivalent
- no embedded webview login
- no client secret in the app

Future web app:

- BFF/session-cookie pattern preferred
- if SPA is used, Authorization Code + PKCE
- no implicit flow

Backend services:

- confidential clients only where service-to-service identity is needed
- no user password handling for normal SSO flows

## Identity Provider Boundary

The platform should support:

- one managed IdP for personal/MVP usage
- enterprise OIDC/SAML later through identity provider abstraction
- tenant-level IdP configuration in enterprise plans

Domain model stores local user/tenant membership, not provider-specific identity records as truth.

## Claims Policy

ID token claims prove authentication context.

Application authorization must use local tenant membership and permission state, not only external IdP claims.

Persist:

- provider subject
- issuer
- email verification status when supplied
- display name/avatar only if needed
- last login metadata

Do not persist unnecessary identity claims.

## Redirect URI Policy

RFC 9700 emphasizes exact redirect URI matching.

Required:

- pre-registered redirect URIs
- environment-specific redirect URIs
- no wildcard production redirects
- no open redirect endpoints
- PKCE verifier/challenge per auth attempt
- state/nonce handling

## Mobile Deep Link Policy

Mobile callback must use:

- platform-supported app links/universal links where possible
- custom scheme only with collision risk documented
- exact redirect configuration

The app validates state before exchanging the authorization code.

## Account Linking

Account linking requires:

- authenticated current session
- re-authentication for sensitive link/unlink
- provider subject uniqueness
- audit log
- rollback/support workflow

## Architecture Rule

OIDC authenticates the user.

The product authorizes tenant actions.
