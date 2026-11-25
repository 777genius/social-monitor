# Observability Retention & Sampling

Date: 2026-05-31
Status: baseline observability retention memory

## Decision

Observability must be useful and cost-controlled. Retention and sampling policies are required from production start.

References:

- OpenTelemetry Sampling: https://opentelemetry.io/docs/concepts/sampling/
- OpenTelemetry Collector Processors: https://opentelemetry.io/docs/collector/components/processor/
- Grafana Loki Retention: https://grafana.com/docs/loki/latest/operations/storage/retention/

## Trace Sampling

Use:

- head sampling for normal traffic if volume requires it;
- tail sampling for slow/error/high-value traces;
- always retain traces for P0/P1 incidents, compliance deletion, connector quarantine and cost runaway.

## Log Retention Classes

```text
debug logs: short retention
normal app logs: medium retention
security/audit logs: longer retention
compliance deletion evidence: policy-specific retention
raw source content in logs: forbidden by default
```

## Metrics Retention

Keep high-resolution metrics short-term and downsample/aggregate for long-term trends.

Important long-term metrics:

- source health;
- cost;
- scan freshness;
- summary validity;
- deletion backlog;
- provider reliability.

## Cost Controls

Control:

- log cardinality;
- trace sampling rate;
- metric label cardinality;
- payload logging;
- retention duration;
- debug log levels in production.

## Locked Decisions

1. Observability retention is policy-driven.
2. Tail sampling is used for high-value traces when volume grows.
3. Raw source content is not logged by default.
4. High-cardinality labels are controlled.
5. Security/audit/compliance retention differs from debug/app logs.

