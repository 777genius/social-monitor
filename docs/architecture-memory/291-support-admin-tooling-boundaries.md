# 291 - Support Admin Tooling Boundaries

## Decision

Build support/admin tooling as a product surface with explicit permissions, redaction and audit.

Support staff must not use direct database access for routine customer support.

## Sources

- OWASP API Security Top 10: https://owasp.org/API-Security/
- OWASP ASVS: https://owasp.org/www-project-application-security-verification-standard/
- NIST Cybersecurity Framework 2.0: https://www.nist.gov/cyberframework
- SOC 2 Trust Services Criteria overview: https://www.aicpa-cima.com/resources/landing/trust-services-criteria

## Support Console Scope

Allowed support views:

- tenant metadata
- plan/entitlement state
- source binding health
- scan/job status
- delivery status
- redacted audit timeline
- usage/quota summary
- incident/status annotations

Restricted by default:

- raw source payloads
- source credentials
- full summaries for sensitive tenants
- user tokens/API keys
- billing payment details
- exports

## Support Access Model

Support access requires:

- support role
- reason code
- time-bounded scope
- tenant/resource scope
- approval for sensitive scopes
- audit event
- automatic expiry

No permanent broad support impersonation.

## Impersonation Policy

Prefer "view as support" with redaction over true impersonation.

If impersonation is required:

- explicit user/tenant approval or internal break-glass flow
- visual indicator
- audit all actions
- block destructive operations unless separately approved
- never reveal secrets

## Safe Actions

Support may perform controlled actions:

- resend verification/email
- trigger credential health recheck
- retry failed webhook/digest delivery
- pause/resume source binding
- add support note
- link incident to tenant

High-risk actions need elevated approval:

- delete tenant data
- export data
- rotate source credentials
- change billing/plan
- disable legal hold/retention

## Audit

Every support view/action records:

- staff actor
- tenant
- resource
- reason
- scope
- fields viewed/action performed
- timestamp
- approval id if any

## Architecture Rule

Support tooling should make safe help easy and unsafe access visible.
