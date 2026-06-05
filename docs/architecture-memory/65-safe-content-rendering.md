# Safe Content Rendering

Date: 2026-05-31
Status: baseline content rendering memory

## Decision

Source content is untrusted and must be rendered as text by default.

Do not render raw source HTML in Flutter/web UI unless it is sanitized and explicitly allowed by feature design.

References:

- OWASP XSS Prevention Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Cross_Site_Scripting_Prevention_Cheat_Sheet.html
- OWASP Content Security Policy Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html
- OWASP Input Validation Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html

## Rendering Rules

Default:

```text
plain text rendering
escaped text
linkified URLs through safe URL parser
no raw HTML
no inline scripts/styles
no remote images unless explicitly proxied/allowed
```

## Links

Links from source content:

- parsed with URL safety rules;
- displayed with canonical host;
- opened externally with user action;
- tracked only according to privacy policy;
- never used as server-side fetch targets without SSRF checks.

## Media

Remote media:

- is not loaded by default in sensitive contexts;
- may be proxied/scanned later if product requires previews;
- must respect source policy;
- must not leak user IP/session data unnecessarily.

## Summaries

LLM summaries may include source quotes/links only if:

- source references are retained;
- output schema validates;
- links pass URL safety checks;
- source policy allows display.

## Locked Decisions

1. Raw source HTML is not rendered by default.
2. Source content is escaped/plain text by default.
3. Linkification uses safe URL handling.
4. Remote media previews are opt-in product features, not default behavior.
5. Summary links/quotes must be schema-validated and source-backed.

