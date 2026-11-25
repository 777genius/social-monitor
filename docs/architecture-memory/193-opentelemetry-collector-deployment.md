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

## Current Metrics Runtime

- Production Nest process roots register exactly one `MetricsRuntimeModule`.
- `SOCIAL_MONITOR_RUNTIME_PROFILE=beta` defaults to OTLP and rejects
  `SOCIAL_MONITOR_METRICS_MODE=in-memory`.
- Beta OTLP mode requires an explicit
  `OTEL_EXPORTER_OTLP_METRICS_ENDPOINT` or
  `OTEL_EXPORTER_OTLP_ENDPOINT`; no hidden localhost fallback is allowed.
- The runtime uses OpenTelemetry JS metrics SDK `2.10.0` with the compatible
  OTLP HTTP exporter `0.221.0`.
- Metric label keys and values are sanitized before recording. Per-instrument
  cardinality defaults to 256 and is bounded to 16-2000.
- Nest shutdown performs a final bounded metrics flush and exporter shutdown.
- The local app compose profile pins Collector Contrib `0.157.0` by immutable
  image digest, receives OTLP/HTTP, applies memory limiting and batching, and
  exposes a Prometheus-compatible endpoint on port `8889`.
- `/ready` reports exporter mode, lifecycle and last export state without
  returning collector URLs or headers.

## Rollout

1. Deploy and verify the Collector before application processes.
2. Configure the signal-specific OTLP metrics endpoint.
3. Start API and workers; beta startup fails closed if the exporter is
   misconfigured.
4. Verify the `metrics_exporter` readiness check and Collector health endpoint.
5. Attach the Prometheus-compatible endpoint to the environment's metrics
   backend before enabling alerts.

## Best-Fact Choice

The Collector keeps observability vendor-neutral and gives one place to enforce sampling, redaction and routing policy.
