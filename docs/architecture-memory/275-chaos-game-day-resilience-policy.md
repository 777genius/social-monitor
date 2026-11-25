# 275 - Chaos Game Day Resilience Policy

## Decision

Use controlled resilience experiments and game days to validate architecture assumptions.

Chaos testing starts in non-production and only moves toward production with clear hypotheses, blast-radius controls and stop conditions.

## Sources

- Google SRE, emergency response and disaster testing: https://sre.google/sre-book/emergency-response/
- Google SRE, disaster role playing: https://sre.google/sre-book/accelerating-sre-on-call/
- AWS Fault Injection Service: https://docs.aws.amazon.com/fis/latest/userguide/what-is.html
- Azure Chaos Studio: https://learn.microsoft.com/en-us/azure/chaos-studio/chaos-studio-overview

## Experiment Template

Every experiment defines:

- hypothesis
- target environment
- affected services
- expected behavior
- blast radius
- abort conditions
- metrics/dashboards
- owner
- rollback plan
- post-test review

No random production breaking.

## MVP Experiments

Start with:

- provider API returns 429
- AI provider timeout
- RabbitMQ consumer crash
- Redis unavailable
- Postgres slow query/connection saturation in staging
- WebSocket node restart
- source adapter malformed payload
- worker killed mid-job

## Expected Behaviors

Validate:

- jobs retry with jitter
- idempotency prevents duplicate side effects
- source status becomes degraded
- summaries degrade instead of blocking ingestion
- WebSocket clients recover through REST
- DLQ catches poison jobs
- alerts fire
- dashboards show cause

## Game Days

Game days test people and process:

- on-call receives alert
- runbook is usable
- owner can find dashboard
- rollback is known
- communication path works
- postmortem action items are created

## Production Guardrails

Before production experiments:

- staging experiment passed
- SLO impact understood
- customer impact bounded
- abort automation/manual stop exists
- incident commander assigned
- support/team notified where needed

## Tooling

Cloud-specific managed tools are optional:

- AWS Fault Injection Service
- Azure Chaos Studio
- Kubernetes/mesh fault injection

The architecture requirement is controlled experiment design, not one tool.

## Architecture Rule

Resilience is not proven by diagrams.

It is proven by observed behavior under controlled failure.
