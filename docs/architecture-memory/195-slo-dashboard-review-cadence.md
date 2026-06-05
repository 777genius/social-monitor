# 195. SLO Dashboard and Review Cadence

## Status

Locked for SRE/observability baseline.

## Research Anchors

- Google SRE alerting on SLOs: https://sre.google/workbook/alerting-on-slos/
- Prometheus recording rules: https://prometheus.io/docs/prometheus/latest/configuration/recording_rules/
- Prometheus recording rule naming: https://prometheus.io/docs/practices/rules/

## Decision

Every SLO has a dashboard, recording rules where useful, alert mapping and review cadence. Alerts are not enough; SLOs need regular product/engineering review.

## Dashboard Sections

For each capability/source:

- current SLI;
- error budget remaining;
- burn rate;
- latency percentiles;
- queue lag/job age;
- retry/DLQ rate;
- provider/source health;
- tenant impact;
- recent deploys/config changes.

## Recording Rules

Use Prometheus recording rules for expensive/reused SLI queries and burn-rate calculations. Rule names must follow a consistent naming convention and be validated in CI.

## Review Cadence

- MVP: weekly reliability review.
- Beta: weekly product/reliability review plus post-incident reviews.
- Production SaaS: monthly SLO review and quarterly objective recalibration.

## Decisions From Review

Reviews can trigger:

- SLO threshold change;
- alert tuning;
- capacity work;
- connector policy change;
- plan/limit adjustment;
- roadmap priority change.

## Best-Fact Choice

SLOs are management tools, not just alerts. Regular review turns telemetry into product and reliability decisions.

