# 127. Admin and Support Safety

## Status

Locked for product/platform baseline.

## Research Anchors

- NIST Digital Identity Guidelines: https://www.nist.gov/identity-access-management/nist-special-publication-800-63-digital-identity-guidelines
- OWASP API Security Top 10: https://owasp.org/API-Security/editions/2023/en/0x00-header/
- NIST Cybersecurity Framework: https://www.nist.gov/cyberframework

## Decision

Support/admin tooling must be designed as a sensitive product surface with least privilege, approvals and audit evidence.

## Access Model

Admin/support actions require:

- named human identity;
- MFA for privileged roles;
- role-based permission;
- tenant-scoped access;
- reason code;
- time-bound session;
- audit event;
- optional approval for high-risk operations.

## Impersonation

Avoid true impersonation where possible. Prefer "support view" that shows tenant/user state without issuing user-equivalent tokens.

If impersonation is later needed:

- explicit approval;
- visible banner;
- no credential/source secret access;
- no destructive action unless separately approved;
- full audit trail with original admin identity.

## Restricted Actions

Require approval:

- tenant deletion restore/cancel;
- manual credential changes;
- billing entitlement override;
- source quota override;
- export raw tenant data;
- replay/backfill beyond normal limits;
- disabling audit/security controls.

## Best-Fact Choice

Admin tooling creates one of the highest internal-risk surfaces. Build safety into the workflow instead of relying on trust in operators.

