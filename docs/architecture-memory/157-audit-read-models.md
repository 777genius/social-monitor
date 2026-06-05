# 157. Audit Read Models

## Status

Locked for audit/compliance baseline.

## Research Anchors

- OWASP Logging Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html
- NIST SP 800-92 Log Management: https://csrc.nist.gov/pubs/sp/800/92/final

## Decision

Audit events are immutable write records, but product/admin UX needs read models optimized for investigation, filtering and evidence export.

## Audit Event Write Model

Immutable event fields:

- event id;
- tenant id;
- actor id/service identity;
- action;
- resource type/id;
- outcome;
- reason code;
- request/trace id;
- timestamp;
- metadata redacted by policy.

## Read Models

Create projections for:

- tenant activity timeline;
- user/admin activity timeline;
- source credential lifecycle;
- privacy request lifecycle;
- support access sessions;
- entitlement/billing overrides;
- security events dashboard.

## Query Controls

- Audit read access is separately authorized.
- Admin searches are tenant-scoped unless platform security role is approved.
- Exports are watermarked and audited.
- Sensitive metadata is redacted by default.
- Retention differs for audit logs vs operational logs.

## Best-Fact Choice

Do not query immutable audit storage directly for every UI need. Keep append-only evidence and build safe read models from it.

