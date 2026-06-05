# 97. Data Retention Schedules

## Status

Locked for architecture baseline.

## Research Anchors

- NIST Privacy Framework: https://www.nist.gov/privacy-framework
- NIST AI Risk Management Framework: https://www.nist.gov/itl/ai-risk-management-framework

## Decision

Retention is a product and privacy control. Store less by default, keep raw data short-lived, and make longer retention a conscious plan/tenant setting.

## Default Retention

| Data class | Personal MVP | SaaS default | Notes |
|---|---:|---:|---|
| raw source payloads | 30 days | 7-30 days | shortest useful debug window |
| normalized items | 180 days | plan-based 90-365 days | needed for search/history |
| summaries | 365 days | plan-based 180-730 days | lower privacy risk than raw, still derived content |
| embeddings | tied to normalized item | tied to normalized item | delete when source item deleted |
| job logs | 30 days | 30-90 days | redact payloads |
| audit logs | 1 year | 1-7 years by plan/regime | immutable where required |
| metrics | 30-90 days | 30-180 days | aggregated where possible |
| traces | 7-14 days | 7-30 days | sampled, redacted |
| billing records | as legally required | as legally required | separate domain |
| deleted account tombstones | 30 days | 30-90 days | prevent accidental recreation conflicts |

## Deletion Rules

- User deletion triggers tenant data deletion workflow.
- Source disconnect stops new ingestion and schedules connector credential cleanup.
- Retention jobs emit audit events and deletion counts.
- Raw payload deletion must not break normalized feed rendering.
- Embeddings and search indexes are downstream copies and must be deleted/rebuilt with source records.

## Plan Overrides

Plans may increase retention, but every increase must show cost and privacy impact. Enterprise custom retention is allowed only if it maps to the same data classes.

## Best-Fact Choice

Short raw retention is the strongest default. Long-term value should come from normalized items, summaries, analytics aggregates and user-curated saved artifacts, not indefinite raw social payload storage.

