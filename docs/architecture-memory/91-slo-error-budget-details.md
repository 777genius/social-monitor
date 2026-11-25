# 91. SLO and Error Budget Details

## Status

Locked for architecture baseline.

## Research Anchors

- Google SRE Workbook: https://sre.google/workbook/alerting-on-slos/
- Prometheus alerting rules: https://prometheus.io/docs/prometheus/latest/configuration/alerting_rules/
- Prometheus alerting overview: https://prometheus.io/docs/alerting/latest/overview/

## Decision

Use SLOs by user-visible capability, not only by service uptime.

Initial SLO classes:

| Capability | First SLO | Error signal |
|---|---:|---|
| API read/write control plane | 99.9% monthly successful requests | 5xx, timeout, auth service unavailable |
| Subscription scheduling | 99.5% schedules started within allowed delay | missed run or lateness beyond policy |
| Source ingestion | source-specific, not global | successful fetch/ingest attempt within provider policy |
| Summary generation | 99% completed within freshness target | failed or stale summary job |
| Notification delivery | 99% accepted by delivery adapter | delivery adapter reject, timeout, exhausted retry |
| Realtime updates | 99% connection/control events reliable | WS disconnect storm or missing invalidation |

Do not promise one generic "scanner uptime". Each source has separate dependencies and legal/API constraints.

## Burn-Rate Alerting

Use multi-window, multi-burn-rate alerts for mature SLOs.

Baseline alert tiers:

| Tier | Window shape | Purpose |
|---|---|---|
| Page | short + medium burn | fast response to active user-visible incidents |
| Ticket | long burn | investigate chronic degradation without waking people |
| Report | weekly/monthly | product and source reliability review |

Prometheus rules must be generated from SLO definitions, not hand-maintained per service. Hand-written alert rules drift too easily in a multi-service system.

## Error Budget Policy

When a capability burns too much budget:

- Freeze risky deploys for the affected component.
- Prioritize reliability fixes over new connector features.
- Reduce optional expensive work first: enrichment, deep comment hydration, broad backfills.
- Keep mandatory compliance/security work unblocked.

Error budgets are scoped by capability and source. A degraded X adapter must not freeze unrelated HN/RSS releases unless shared infrastructure is the cause.

## Metrics Contract

Every service must emit:

- request/job count by outcome;
- latency histogram for user-visible operation;
- queue lag for async boundaries;
- retry count and DLQ count;
- tenant and source labels only at controlled cardinality.

High-cardinality labels such as user id, topic id, raw URL, post id and prompt hash are forbidden in Prometheus metrics. Put those in traces/logs with sampling and redaction.

## Best-Fact Choice

SLOs must be created before public SaaS launch. For personal MVP, track the same metrics but use softer thresholds. This avoids rewriting observability when the product becomes multi-tenant.

