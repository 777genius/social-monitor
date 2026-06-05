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
