# 179. Runbook Catalog

## Status

Locked for operations baseline.

## Research Anchors

- AWS Well-Architected reliability testing: https://docs.aws.amazon.com/wellarchitected/latest/reliability-pillar/rel_testing_resiliency.html
- Kubernetes debug running pods: https://kubernetes.io/docs/tasks/debug/debug-application/debug-running-pod

## Decision

Maintain a catalog of operational runbooks before production. Runbooks must contain safe commands, decision points and rollback/escalation criteria.

## Initial Runbooks

Required:

- API elevated 5xx/latency;
- scheduler backlog;
- source provider outage;
- source quota exhaustion;
- RabbitMQ queue backlog/DLQ;
- Kafka consumer lag;
- Postgres high connections/slow queries;
- Redis outage/degraded cache;
- AI provider outage/budget exhaustion;
- notification delivery failure;
- stuck deletion workflow;
- credential refresh failures;
- incident communication/status update;
- production deploy rollback.

## Runbook Format

Each runbook includes:

- symptom;
- impact;
- dashboards/alerts;
- safe diagnostic commands;
- immediate mitigation;
- escalation;
- rollback;
- customer communication notes;
- post-incident checks.

## Best-Fact Choice

Runbooks are not prose documentation. They are operational tools and must be tested during drills/game days.

