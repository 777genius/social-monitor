# Observability Dashboards & Alerts

Date: 2026-05-31
Status: baseline observability dashboards memory

## Decision

Dashboards and alerts must be organized by product reliability surfaces, not only infrastructure components.

Use Prometheus/Grafana-style metrics and Alertmanager/Grafana Alerting for routing, grouping and notification.

References:

- Grafana Alerting: https://grafana.com/docs/grafana/latest/alerting/
- Prometheus Alertmanager: https://prometheus.io/docs/alerting/latest/alertmanager/
- OpenTelemetry messaging conventions: https://opentelemetry.io/docs/specs/semconv/messaging/

## Required Dashboards

Product:

```text
tenant activity
topic/source counts
feed freshness
summary readiness
digest delivery
cost by tenant/source/model
```

Ingestion:

```text
connector runs by source/status
items discovered
rate limit remaining
provider health
empty result anomalies
cursor lag
```

Queues:

```text
RabbitMQ queue depth
oldest job age
DLQ growth
Kafka consumer lag
retry rates
```

AI:

```text
summary job latency
schema validity
token usage
cost
model errors
eval regression
```

Compliance:

```text
deletion backlog
tombstone processing age
raw payload purge status
post-restore deletion replay status
```

## Alert Principles

Alert on user/product impact and exhausted error budget, not every noisy metric.

Page on:

- tenant isolation risk;
- credential leak;
- compliance deletion backlog age;
- cost runaway;
- severe queue lag affecting freshness;
- summary/digest SLO breach;
- Postgres backup/PITR failure;
- provider-wide outage if it breaks promised SLO.

Ticket, not page:

- single low-priority scan failed;
- non-critical provider degradation;
- isolated webhook endpoint failure;
- low-volume DLQ under threshold.

## Required Alert Metadata

Alerts include:

```text
service
owner
severity
runbook_url
dashboard_url
tenant/source scope when applicable
```

## Locked Decisions

1. Dashboards are product-surface oriented.
2. Alerts include runbook and owner.
3. Page only on actionable user/business impact.
4. Compliance/cost/security alerts are high priority.
5. Queue metrics include oldest job age, not only queue depth.

