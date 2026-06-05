# 168. Worker and Event Error Taxonomy

## Status

Locked for async reliability baseline.

## Research Anchors

- RFC 9457 Problem Details for HTTP APIs: https://www.rfc-editor.org/rfc/rfc9457
- RabbitMQ dead letter exchanges: https://www.rabbitmq.com/docs/dlx
- Kafka consumer configs: https://kafka.apache.org/documentation/#consumerconfigs

## Decision

Async errors need stable categories just like HTTP errors. Workers and event consumers must classify failures before retrying.

## Categories

| Category | Retry | Examples |
|---|---|---|
| `transient_provider` | yes with backoff | upstream 5xx, timeout |
| `quota_exhausted` | delayed retry or skip | source/tenant quota |
| `rate_limited` | delayed retry | provider 429 |
| `credential_invalid` | no, mark attention | revoked token |
| `validation_failed` | no | malformed accepted command/job |
| `poison_message` | no, DLQ | schema impossible to process |
| `dependency_unavailable` | yes | DB/broker/object store outage |
| `budget_exhausted` | delayed/skip | AI/source spend guard |
| `policy_blocked` | no | source terms/plan disallow |
| `bug_suspected` | stop/DLQ and alert | invariant violation |

## Rules

- Every failed job records category and reason.
- Retries use bounded exponential backoff with jitter.
- DLQ entries include enough context to replay safely.
- Poison messages do not loop forever.
- User-visible state is updated for credential/quota/policy failures.
- Internal stack traces do not leak to public API.

## Best-Fact Choice

Retries without taxonomy create storms and hide product states. Error classification is required for reliable async systems.

