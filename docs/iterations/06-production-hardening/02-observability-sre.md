# Iteration 06 / Phase 02 - Observability And SRE

## Objective

Make the MVP operable before users depend on it.

## Steps

1. Add OpenTelemetry traces/metrics/log correlation.
2. Create dashboards: API, worker, provider, AI, DB, queues.
3. Define MVP SLOs.
4. Add alert rules.
5. Add runbooks.
6. Add DLQ repair workflow.
7. Add backup/restore drill.
8. Define safe metric dimensions and forbidden labels.
9. Define support triage taxonomy for scan, source, feed, summary and delivery failures.
10. Add user-visible status mapping for common backend failure classes.

## MVP Observability Contract

Minimum required signals:

- API: request rate, latency, error rate, auth failures and Problem Details codes.
- Workers: job created/started/completed/failed, retry count, DLQ count and queue lag.
- Sources: provider latency, provider error class, quota/rate-limit hits and credential health.
- Feed: normalized items written, dedupe merges, unavailable/deleted items and read latency.
- Summaries: summary jobs, schema validation failures, citation failures, cost/tokens and provider errors.
- Realtime/delivery: connected clients, resync-required count, notification/webhook attempts and delivery failures.
- Data: migration state, DB health, hot query latency and backup/restore status.

Safe dimensions:

- tenant/workspace id hash or internal id, source provider key, job type, failure class, status and environment.

Forbidden labels:

- provider credentials, raw source text, prompt text, user email, API keys, full URLs with secrets or high-cardinality item bodies.

Alerts should exist only when there is a clear action: investigate provider outage, pause source, drain DLQ, rollback deploy, raise quota, rotate secret or notify beta users.

## MVP SLO Baseline

Use these as initial beta targets, then revise with real traffic:

| Area | Target | Notes |
| --- | --- | --- |
| API availability | 99.5% during beta window | excludes planned maintenance |
| API p95 latency | under 500 ms for read models | feed/detail endpoints may have separate budget |
| Scheduled scan freshness | 95% within 2x configured interval | source limits can mark degraded |
| Summary job completion | 95% within accepted budget/window | excludes provider outage and no-signal |
| WS resync reliability | 99% reconnects recover via replay or REST resync | REST snapshot remains truth |
| DLQ visibility | 100% DLQ items classified with owner/action | no silent DLQ |
| Secret redaction | 100% in tested sinks | blocker if violated |

## Capacity Observability Rules

1. Dashboards must show current beta envelope usage: tenants, topics, source bindings, scheduled scans, summary jobs, delivery attempts and cost.
2. Queue lag must be visible by job type and tenant/source grouping without high-cardinality labels.
3. Noisy-tenant detection must show whether one tenant/source/topic is consuming disproportionate worker, provider or AI budget.
4. Provider pressure must separate local worker backlog from external provider rate limits/outages.
5. Cost dashboards must show accepted, rejected and completed usage records, not only successful provider calls.
6. Every degradation state needs a user-visible status and a support-visible diagnostic class.
7. Alert thresholds should map to the capacity envelope: warn before ring expansion becomes unsafe, page only for actionable beta-impacting degradation.

## Degradation Signal Matrix

| Signal | User State | Operator Action |
| --- | --- | --- |
| scan queue lag above SLO | freshness degraded | inspect noisy tenants, reduce intervals, add worker only if provider budget allows |
| provider rate-limit spike | source degraded | pause/reduce affected source capability, notify beta users if persistent |
| summary queue lag above SLO | summary queued/stale | reduce summary frequency, enforce token budget, verify AI provider health |
| cost burn above daily envelope | quota blocked/degraded | tighten quotas or pause non-core summaries before cost is incurred |
| DB read latency above budget | feed slower/degraded | inspect hot queries/indexes, reduce expensive filters before core reads |
| WS resync failures | realtime degraded | rely on REST snapshot, investigate gateway/replay retention |
| DLQ growth | affected workflow degraded | classify, assign owner, run repair or suppress retry storm |

## Runbook Minimum

Each alert/runbook includes:

1. what users see
2. likely affected component
3. dashboard links
4. safe query/log examples
5. first mitigation
6. rollback/pause action
7. when to notify beta users
8. owner/escalation
9. evidence to attach after incident

Required runbooks:

- provider outage or rate-limit spike
- scan queue backlog
- summary provider/citation failures
- DLQ growth
- quota/cost spike
- WebSocket resync failure
- migration/deploy rollback
- credential leak suspicion
- backup restore

## Edge Cases

- Async trace lost between API and worker.
- Provider outage looks like worker bug.
- DLQ grows silently.
- Backup restore not tested.
- High-cardinality labels make metrics unusable or expensive.
- Alert fires but no runbook tells support what to do.
- User-visible failure has no matching operational signal.
- Metrics cardinality spikes because source URL or prompt text becomes a label.
- Trace exists but correlation id is not shown to support/user.
- Alert is correct but no safe mitigation exists.
- Provider outage affects only one source capability, not all scans.
- Capacity dashboard shows green while one tenant consumes most worker budget.
- Worker autoscaling increases provider rate-limit failures.
- Cost dashboard misses rejected usage records and hides quota pressure.
- Queue lag is high but user-facing freshness state still says healthy.

## Pay Attention

- Dashboards must answer "what is broken?" quickly.
- Alerts need action, not noise.
- Trace/correlation ids must cross job boundaries.
- Logs are for diagnosis, metrics are for trends, traces are for path reconstruction; do not rely on one signal for all purposes.
- Support dashboards should classify failure, not expose raw internal payloads.
- A dashboard that requires shell/database access is not sufficient for beta support.
- Every user-visible failure state should have a matching operational signal and runbook.
- SLOs without capacity envelope are weak; every SLO should say what load it is valid for.
- Autoscaling is not a substitute for provider budget, quota or backpressure policy.

## Acceptance Criteria

- End-to-end scan trace exists.
- Alerts fire in staging failure drill.
- Restore drill completes.
- Runbooks are linked from alerts.
- Dashboards can answer: affected tenant/topic/source, failure class, retry/DLQ state and user-visible status.
- Metrics pass safe-label review.
- SLO baseline exists and alert thresholds are tied to actions.
- Staging drills prove at least provider outage, DLQ growth and backup restore paths.
- Capacity dashboards show envelope usage, queue lag, noisy-tenant pressure and cost burn.
- Degradation signals map to user-visible state and operator action.
