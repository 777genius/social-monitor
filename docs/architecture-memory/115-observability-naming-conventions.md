# 115. Observability Naming Conventions

## Status

Locked for implementation blueprint.

## Research Anchors

- OpenTelemetry semantic conventions: https://opentelemetry.io/docs/concepts/semantic-conventions/
- OpenTelemetry HTTP semantic conventions: https://opentelemetry.io/docs/specs/semconv/http/

## Decision

Use OpenTelemetry semantic conventions first, then add product-specific attributes with strict cardinality control.

## Span Names

Use stable low-cardinality names:

```text
HTTP GET /v1/interests
gRPC EntitlementService.CheckLimit
Kafka publish item.normalized.v1
Kafka consume summary.created.v1
RabbitMQ job ai.summarize
SourceAdapter reddit.fetchIncremental
LLM summarizeCluster
Postgres TopicRepository.save
```

Do not put tenant ids, topic ids, URLs, search strings or source item ids in span names.

## Required Attributes

Allowed controlled attributes:

- `app.tenant_plan`;
- `app.source_kind`;
- `app.context`;
- `app.operation`;
- `app.job_type`;
- `app.event_type`;
- `app.summary_policy_version`;
- `app.adapter_kind`;

Sensitive/high-cardinality values:

- tenant id;
- user id;
- topic id;
- source item id;
- URL;
- query text;
- prompt text;
- raw payload ref.

These may appear only in sampled traces/logs when redaction policy allows, never as metrics labels.

## Metrics Names

Examples:

- `app_api_requests_total`;
- `app_jobs_processed_total`;
- `app_job_duration_seconds`;
- `app_queue_lag_seconds`;
- `app_source_fetch_total`;
- `app_source_quota_remaining`;
- `app_ai_summary_total`;
- `app_ai_cost_estimated_usd`;
- `app_idempotency_replays_total`;

## Best-Fact Choice

Observability must be designed with naming and cardinality rules before scale. Otherwise metrics become expensive, traces become hard to search, and sensitive data leaks through telemetry.

