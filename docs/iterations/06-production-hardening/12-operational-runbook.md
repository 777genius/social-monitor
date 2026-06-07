# Iteration 06 - Operational Runbook

## Daily Workflow

1. Run tenant isolation tests.
2. Check secret redaction tests.
3. Review dashboards after new metrics.
4. Run CI contract and migration checks.
5. Inspect queue/backlog simulations.
6. Update runbooks with new failure modes.
7. Verify alerts still point to current runbook sections.
8. Review DLQ, quota and provider outage trends.

## Review Cadence

- Security review before beta launch.
- Observability review before support handoff.
- CI/CD review before staging deploy.
- Cost/quota review before external users.

## Blockers

- Cross-tenant tests fail.
- Logs expose secrets.
- Provider failure lacks dashboard visibility.
- Queue backlog is not bounded.
- Backup restore is unverified.
- Alert has no owner or action.
- Support cannot identify affected tenant/topic/source from safe signals.
- User-visible status does not match backend failure state.

## Handoff Notes

- Hand off dashboards to support.
- Hand off alert thresholds to on-call.
- Hand off rollback plan to release owner.
- Hand off quota policy to product/support.
- Hand off failure taxonomy and support macros for common beta issues.
- Hand off DLQ triage and replay rules.

## Support And Ops Impact

- Support must diagnose scan, provider, summary and delivery failures from dashboards.
- Alerts must point to runbooks, not just raw metrics.
- Quotas should be explainable to beta users.
- Support should never need raw provider credentials, raw prompts or database shell access for common beta triage.
- Every incident should end with either a product limitation, source/provider issue, user configuration issue, system bug or capacity/cost issue classification.

## Scan Status Triage

Scan status API responses expose support-safe fields for beta triage:

- `userState=scan_pending`: scan was requested but not enqueued yet. Check scheduler lag or enqueue path if it lasts beyond the freshness SLO.
- `userState=scan_in_progress`: scan is enqueued or being processed. Check worker lag if it exceeds configured freshness expectations.
- `userState=content_current`: scan completed successfully. No support action is required.
- `userState=scan_degraded` with `failureClass=provider_unavailable`: check provider health, retry budget and affected source capability.
- `userState=scan_degraded` with `failureClass=provider_rate_limited`: reduce scan frequency or pause the affected source before adding workers.
- `userState=scan_degraded` with `failureClass=worker_conflict`: inspect scan lease ownership and worker lag.
- `userState=scan_degraded` with `failureClass=system_failure`: inspect scan attempts, logs and DLQ without exposing raw source payloads.

## Queue Backlog Triage

- `queue_commands_enqueued_total{command_type=ingestion.scan.execute,job_type=scan,status=enqueued}` shows accepted scan queue work.
- `queue_commands_backlog{command_type=ingestion.scan.execute,queue=scan}` shows current in-memory scan queue depth after enqueue.
- If backlog grows while `scan_jobs_total{status=started}` is flat, inspect worker availability before increasing scan frequency.
- If backlog grows together with provider rate-limit failures, reduce scan frequency or pause affected sources before adding workers.
- Queue lag seconds is intentionally not emitted yet because the MVP in-memory queue has no ack/dequeue timestamp model; add it when the broker adapter exposes consumed/acked timestamps.

## DLQ Triage

- `scan_failure_queue_events_total{queue=scan-retry,status=retry_enqueued}` shows failed scans accepted for retry.
- `scan_failure_queue_backlog{queue=scan-retry}` shows retry queue depth.
- `scan_failure_queue_events_total{queue=scan-dlq,status=dead_lettered}` shows scans that exhausted retry budget.
- `scan_failure_queue_backlog{queue=scan-dlq}` shows scan failures requiring manual classification.
- First action: classify the failure as provider outage, provider rate limit, worker conflict, source configuration, system bug or unsafe replay.
- Replay only after confirming the source capability and retry budget; suppress retry storms before increasing workers.
- Never inspect raw source payloads or credentials during DLQ triage; use scan id, source binding id, safe failure class and correlation id.

## Provider Failure Triage

- `scan_failures_total{failure_class=provider_unavailable,job_type=scan,worker=ingestion-worker}` shows provider availability failures.
- `scan_failures_total{failure_class=provider_rate_limited,job_type=scan,worker=ingestion-worker}` shows provider rate-limit failures.
- If provider unavailable failures rise, check provider health and source capability before replaying scans.
- If provider rate-limit failures rise, reduce scan frequency, enforce quota/backoff and avoid adding workers until provider pressure is controlled.
- Provider failure triage must not use raw URLs, prompts, source item bodies or credentials as metric labels.

## Summary Cost Triage

- `summary_model_estimated_cost_usd{provider,model}` shows estimated summary model spend by low-cardinality route.
- `summary_model_tokens_total{token_type=output}` helps detect oversized summary outputs after prompt/model changes.
- If estimated cost rises, confirm quota preflight and model route before replaying failed or delayed summary jobs.
- Prefer reducing summary frequency, max evidence items or output budget before changing provider routing.
- Do not add prompt text, source URLs or user emails to metric labels while diagnosing cost spikes.
