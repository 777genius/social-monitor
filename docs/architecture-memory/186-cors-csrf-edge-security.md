# 186. CORS and CSRF Edge Security

## Status

Locked for API gateway baseline.

## Research Anchors

- NestJS CORS: https://docs.nestjs.com/security/cors
- OWASP CSRF Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html

## Decision

CORS and CSRF are edge/API concerns with explicit browser-client assumptions. Mobile clients and server-to-server clients use bearer/service tokens; browser clients require stricter origin and cookie rules.

## CORS Rules

- No wildcard origins for credentialed requests.
- Maintain per-environment allowed origins.
- Reject unknown origins by default.
- Keep allowed methods and headers minimal.
- Expose only required response headers.
- Audit changes to production origin allowlists.

## CSRF Boundary

If browser sessions use cookies:

- use SameSite cookies where possible;
- use CSRF tokens for state-changing requests;
- never mutate state on GET;
- validate origin/referer as defense-in-depth;
- require explicit reauthentication/confirmation for high-risk actions.

If browser clients use authorization headers without ambient cookies, CSRF risk is reduced but XSS/token theft risk becomes more important.

## Best-Fact Choice

CORS is not an authorization mechanism. It only controls browser cross-origin access. Authorization and CSRF protection remain separate controls.

