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
