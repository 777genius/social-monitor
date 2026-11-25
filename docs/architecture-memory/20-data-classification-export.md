# Data Classification, Retention & Export

Date: 2026-05-31
Status: baseline data classification memory

## Decision

Every major data class must have explicit classification, retention, deletion and export behavior.

Public social content can still contain personal data. Treat source content as policy-sensitive even when publicly visible.

Reference:

- NIST Privacy Framework: https://www.nist.gov/privacy-framework/privacy-framework

## Data Classes

```text
account_identity_data
tenant_configuration
connector_credentials
source_raw_payload
canonical_source_item
normalized_item
summary
digest
audit_log
cost_ledger
lineage_event
webhook_delivery
notification_delivery
analytics_event
```

## Classification Fields

```text
classification
contains_personal_data
contains_secret
source_policy_sensitive
retention_period
deletion_behavior
export_behavior
backup_behavior
access_roles
```

## Default Rules

Connector credentials:

- secret;
- encrypted;
- never exported;
- deleted/revoked on account deletion.

Raw payloads:

- shortest retention;
- source-policy governed;
- not blindly exported;
- not rendered without sanitization.

Summaries:

- derived generated content;
- traceable to input items;
- deleted/tombstoned if source/user policy requires it.

Audit logs:

- retained longer;
- append-only;
- restricted access;
- no raw source text or secrets.

Cost ledger:

- retained for billing/audit;
- no raw source text;
- tenant-scoped.

Lineage:

- retained enough to support deletion, debugging and quality investigation.

## User/Tenant Export

Export should include product-owned canonical data:

```text
topics
topic rules
source bindings
scan schedules
summary rules
digests
saved summaries
notification preferences
usage/cost summary
```

Do not blindly export:

- encrypted connector secrets;
- raw third-party payloads if source policy forbids redistribution;
- internal provider metadata;
- security-sensitive audit fields.

## Locked Decisions

1. Retention cannot be one global setting.
2. Export is generated from product-owned canonical data, not provider raw payloads.
3. Connector credentials are never exported.
4. Raw payloads have short, source-policy-specific retention.
5. Data classification is required before GA/SaaS readiness.

