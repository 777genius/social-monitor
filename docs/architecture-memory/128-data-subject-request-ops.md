# 128. Data Subject Request Operations

## Status

Locked for privacy/compliance baseline.

## Research Anchors

- European Commission data subject rights: https://commission.europa.eu/law/law-topic/data-protection/reform/rights-citizens/my-rights_en
- European Data Protection Board SME guide: https://www.edpb.europa.eu/sme-data-protection-guide/respect-individuals-rights_en
- European Commission personal data explainer: https://commission.europa.eu/law/law-topic/data-protection/reform/what-personal-data_en

## Decision

Implement privacy request workflows as audited operations, even before formal enterprise compliance is required.

## Request Types

Support:

- access request;
- export/portability;
- deletion/erasure;
- rectification;
- objection/restriction where applicable;
- explanation of automated processing behavior where applicable.

## Workflow

```text
request received -> verify requester -> classify scope
-> collect affected data classes -> execute/export/delete/rectify
-> verify completion -> record audit evidence -> notify requester
```

## Data Classes

DSR workflow must cover:

- user profile;
- memberships;
- topics/rules/preferences;
- source bindings and credential metadata;
- normalized items tied to user/tenant where applicable;
- summaries/digests;
- notifications;
- audit logs where deletion may be legally restricted;
- support/admin notes;
- telemetry with identifiable references where retained.

## Rules

- Deletion is asynchronous and emits progress states.
- Derived data, embeddings and indexes must be deleted or rebuilt.
- Raw payloads are short-lived; retained raw references must be included in deletion scan.
- Audit logs may retain minimal evidence when legally required.
- DSR operations must not leak other tenants' data.

## Best-Fact Choice

Privacy operations must be modeled as first-class workflows. Manual database deletion will fail once data exists in projections, embeddings, object storage and audit systems.

