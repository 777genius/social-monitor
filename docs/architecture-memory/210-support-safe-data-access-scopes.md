# 210. Support-Safe Data Access Scopes

## Status

Locked for support/admin baseline.

## Research Anchors

- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- NIST Digital Identity Guidelines: https://www.nist.gov/identity-access-management/nist-special-publication-800-63-digital-identity-guidelines
- EDPB processor obligations FAQ: https://www.edpb.europa.eu/sme-data-protection-guide/faq-frequently-asked-questions/answer/do-data-processors-also-have_en

## Decision

Support access uses scoped, redacted views by default. Raw tenant/source data access requires elevated approval and audit.

## Access Levels

| Level | Data |
|---|---|
| `support_metadata` | tenant id, plan, status, source binding state, job ids |
| `support_content_summary` | summary/digest metadata and redacted titles |
| `support_content_read` | normalized item text where approved |
| `support_raw_payload` | raw provider payload refs/content, break-glass only |
| `security_admin` | security/audit views with stricter controls |

## Rules

- Default support tooling starts at metadata level.
- Escalation needs reason, ticket and time limit.
- Raw payload access is break-glass and separately audited.
- Source credentials are never visible to support.
- Support exports are watermarked and logged.

## Best-Fact Choice

Support needs enough context to solve problems, not unrestricted data access. Redacted scoped views reduce privacy risk and still keep support useful.

