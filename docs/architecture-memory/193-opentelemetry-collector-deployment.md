# 193. OpenTelemetry Collector Deployment

## Status

Locked for observability baseline.

## Research Anchors

- OpenTelemetry Collector: https://opentelemetry.io/docs/collector/
- Collector and Kubernetes: https://opentelemetry.io/docs/platforms/kubernetes/collector/
- Collector Helm chart: https://opentelemetry.io/docs/platforms/kubernetes/helm/collector/
- Collector processors: https://opentelemetry.io/docs/collector/components/processor/

## Decision

Use OpenTelemetry Collector as the vendor-neutral telemetry gateway. Application services emit OTLP; collectors process, sample, redact and export.

## Topology

Initial:

- gateway Collector deployment per environment;
- optional agent/DaemonSet only when node/log collection needs it;
- OTLP from services to Collector;
- exporters to metrics/traces/log backends.

## Processors

Use processors for:

- batching;
- memory limiting;
- resource attributes;
- Kubernetes attributes where useful;
- tail/head sampling where supported;
- redaction/filtering before export.

## Rules

- Services do not export directly to vendor backends by default.
- Collector config is version-controlled.
- Sensitive attributes are dropped/redacted centrally where possible.
- High-cardinality attributes are blocked from metrics.
- Collector health is monitored separately.

## Best-Fact Choice

The Collector keeps observability vendor-neutral and gives one place to enforce sampling, redaction and routing policy.

