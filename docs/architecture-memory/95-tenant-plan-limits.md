# 95. Tenant Plan Limits

## Status

Locked for architecture baseline.

## Research Anchors

- FinOps Foundation: https://www.finops.org/
- Google SRE Workbook alerting/SLO principles: https://sre.google/workbook/alerting-on-slos/

## Decision

Plan limits are enforcement data, not marketing copy.

Limits must be represented in entitlements and consumed by scheduler, ingestion, AI workers, notification workers and API gateway.

## Initial Limit Dimensions

| Dimension | Why it matters |
|---|---|
| topics per tenant | controls saved queries and summary surface |
| source bindings per topic | controls connector fanout |
| minimum scan interval | controls scheduler pressure and provider quota |
| max scans per day | hard cost and rate-limit ceiling |
| summary jobs per day | LLM cost ceiling |
| max lookback/backfill window | replay cost and provider pressure |
| notification channels | delivery cost and abuse surface |
| retention period | storage and privacy exposure |
| team seats | authorization and billing |
| API keys/webhooks | external abuse and support burden |

## Enforcement Points

| Limit type | Enforced by |
|---|---|
| request rate | API gateway |
| scan frequency | scheduler |
| source quota | connector quota manager |
| LLM budget | intelligence worker budget guard |
| storage retention | lifecycle/reaper jobs |
| delivery volume | notification service |
| feature availability | entitlement service |

Do not enforce limits only in UI. UI helps explain limits; backend owns enforcement.

## Grace and Degradation

When a tenant exceeds limits:

- block new optional work first;
- keep already accepted critical jobs if budget allows;
- show explicit reason in API error and UI state;
- never silently skip scans without a recorded skip event.

Enterprise tenants can have custom limits, but custom limits still compile into the same entitlement model.

## Best-Fact Choice

Multi-tenant scheduler fairness depends on limits being machine-readable. Plan limits must be part of the domain model before scaling, not added after one tenant can starve the queues.

