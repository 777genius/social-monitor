# Chaos & Resilience Testing

Date: 2026-05-31
Status: baseline resilience testing memory

## Decision

Use targeted resilience testing before broad chaos engineering.

The goal is to verify specific failure modes, not randomly break production.

## Test Failure Modes

Required staged tests:

```text
Reddit rate limit
X provider outage
OpenAI/LLM timeout
RabbitMQ queue backlog
Kafka consumer lag
Postgres slow query
object storage unavailable
webhook endpoint timeout
email provider bounce spike
connector malformed payload
```

## Environments

Run destructive/resilience tests in:

```text
local
dev
staging
```

Production resilience tests require:

- explicit scope;
- owner;
- rollback plan;
- maintenance window or controlled blast radius;
- monitoring.

## Expected Behaviors

When dependencies fail:

- system degrades source-specifically;
- no global crash;
- retries are bounded;
- DLQ captures poison tasks;
- user-facing status is actionable;
- cost does not run away;
- compliance jobs still run.

## Locked Decisions

1. Resilience testing is targeted and hypothesis-driven.
2. Broad chaos is not MVP requirement.
3. Failure tests verify degradation behavior.
4. Production chaos requires explicit approval.
5. Compliance/cost controls are part of resilience tests.

