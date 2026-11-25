# 239 - OpenTelemetry NestJS/Kubernetes Policy

## Decision

Use OpenTelemetry as the vendor-neutral telemetry contract across NestJS services, workers and Kubernetes infrastructure.

Instrumentation emits OTLP to Collectors; services do not integrate directly with a vendor backend.

## Sources

- OpenTelemetry JavaScript docs: https://opentelemetry.io/docs/languages/js/
- OpenTelemetry Collector: https://opentelemetry.io/docs/collector/
- OpenTelemetry Collector and Kubernetes: https://opentelemetry.io/docs/platforms/kubernetes/collector/
- OpenTelemetry Collector Helm chart: https://opentelemetry.io/docs/platforms/kubernetes/helm/collector/

## Signal Ownership

Required signals:

- traces
- metrics
- structured logs

OpenTelemetry JS documents traces and metrics as stable while logs may have different maturity. For logs, prefer structured application logging with trace correlation and route through Collector/agent where practical.

## Service Instrumentation

NestJS services must emit:

- HTTP request spans
- gRPC client/server spans
- DB spans
- Redis spans
- RabbitMQ/Kafka spans where supported
- external provider call spans
- AI provider call spans with redacted metadata

Do not put raw post content, prompts or credentials in spans.

## Required Attributes

Low-cardinality attributes:

- `service.name`
- `deployment.environment`
- `tenant.plan`
- `source.type`
- `worker.class`
- `job.type`
- `provider.name`
- `error.type`

High-cardinality IDs are allowed only when sampled or placed in logs with retention/redaction controls:

- tenant id
- topic id
- source binding id
- job id
- trace id

## Collector Topology

Kubernetes uses:

- DaemonSet Collector for node/pod logs and local workload telemetry where needed
- Deployment Collector for cluster metrics/events and gateway export

The Collector owns:

- batching
- memory limiting
- sampling
- attribute processing
- export retries
- backend routing

## Sampling

Default:

- sample normal successful traces
- keep error traces
- keep slow traces
- keep provider outage traces
- keep payment/security/admin traces according to policy

Sampling policy must not remove audit logs.

## Dashboards

Dashboards must cover:

- API latency/error rate
- worker queue latency
- source provider error rate
- AI cost/latency
- DB query latency
- Redis latency/evictions
- Kafka/RabbitMQ health
- WebSocket connections/events

## Incident Debugging

Every external effect should be traceable:

```text
API request -> command/use case -> outbox/job -> worker -> provider call -> DB write -> event -> WS notification
```

## Architecture Rule

Telemetry schema is part of architecture.

If a workflow cannot be traced across async boundaries, it is not production-ready.
