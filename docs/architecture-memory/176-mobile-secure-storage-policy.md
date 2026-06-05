# 176. Mobile Secure Storage Policy

## Status

Locked for Flutter/mobile security baseline.

## Research Anchors

- OWASP MASVS: https://mas.owasp.org/MASVS/
- OWASP MASVS storage controls: https://mas.owasp.org/MASVS/controls/MASVS-STORAGE/
- Flutter internationalization/security-adjacent platform docs are handled separately in frontend docs.

## Decision

Mobile device storage is hostile by default. Store only what the app needs for UX continuity and keep high-value credentials on the backend.

## Allowed Local Storage

Allowed:

- short-lived session/access state needed to call backend;
- refresh token only in platform secure storage if mobile auth flow requires it;
- cached read models with non-sensitive product data;
- user preferences;
- offline queued low-risk actions with idempotency keys.

Forbidden:

- source provider OAuth tokens;
- webhook secrets;
- API key full secrets after creation;
- raw source payloads;
- LLM prompts containing user/source content;
- unredacted support/admin data.

## Controls

- Use platform secure storage for tokens.
- Clear sensitive local state on logout/session revocation.
- Avoid sensitive data in screenshots, logs, crash reports and analytics.
- Treat rooted/jailbroken detection as risk signal, not sole security control.
- Backend remains authority for authorization and entitlements.

## Best-Fact Choice

Mobile secure storage reduces risk but cannot make the device fully trusted. Keep valuable source credentials and privileged actions backend-owned.

