# Retry, DLQ & Poison Message Conventions

Date: 2026-05-31
Status: baseline retry/DLQ memory

## Decision

All queue consumers need explicit retry, DLQ and poison-message policy.

Use RabbitMQ quorum queues for important task queues. Use at-least-once dead-lettering where queue safety matters and operational tradeoffs are understood.

MVP beta RabbitMQ task queues must be declared through the platform RabbitMQ queue-arguments helper so publishers and readers share `x-queue-type=quorum`, bounded `x-delivery-limit` and the same DLX argument shape.

References:

- RabbitMQ Quorum Queues: https://www.rabbitmq.com/docs/next/quorum-queues
- RabbitMQ Dead Letter Exchanges: https://www.rabbitmq.com/docs/3.13/dlx
- AWS Builders Library retries/backoff/jitter: https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/

## Error Classes

Classify errors:

```text
retryable_transient
retryable_rate_limited
retryable_provider_degraded
permanent_invalid_config
permanent_auth_required
permanent_policy_blocked
poison_malformed_payload
poison_invariant_violation
```

## Retry Policy

Every task type defines:

```text
max_attempts
initial_delay
max_delay
jitter
retry_window
timeout
dead_letter_queue
idempotency_key
```

No infinite retries.

## DLQ Policy

DLQ message must include:

```text
original_queue
task_type
tenant_id
correlation_id
idempotency_key
attempt_count
error_class
error_code
failed_at
payload_ref
```

DLQ replay requires:

- permission;
- reason;
- max replay count;
- budget guard where relevant;
- audit event.

## Poison Messages

Poison messages are not operational noise; they indicate contract or invariant failure.

Poison messages require:

- triage;
- root cause;
- schema/mapper fix or payload quarantine;
- replay only after fix.

## Locked Decisions

1. No queue without retry/DLQ policy.
2. No infinite retries.
3. DLQ replay is audited.
4. Poison messages are treated as bugs or schema violations.
5. Retry behavior is task-type-specific, not globally generic.
6. Production RabbitMQ queue declarations do not build DLX/quorum arguments ad hoc.
