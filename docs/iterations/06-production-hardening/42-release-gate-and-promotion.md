# Iteration 06 - Release Gate And Promotion

## Promotion Goal
Approve movement from hardening into controlled beta launch.

## Required Evidence
- Tenant isolation tests pass across REST, workers, events and realtime.
- Secrets are encrypted and redacted.
- CI blocks breaking contracts, events and migrations.
- Dashboards cover scan, summary, cost, queue and delivery failures.
- Quotas and backup/restore checks are validated.

## Promotion Checks
- No known cross-tenant access remains.
- Provider credentials cannot appear in logs/traces/errors.
- Support can diagnose common failures without shell access.
- Cost spikes are bounded by quota policy.

## Hold Conditions
- Any critical security gate is unresolved.
- Observability omits user-visible failures.
- CI does not protect public contracts.
- Backup/restore evidence is missing.

## Rollback Or Rework
- Rework tenant isolation before beta starts.
- Rework redaction before provider credentials are used by beta.
- Rework dashboards before support ownership begins.

## Approval
Hardening may promote only when beta has clear go/no-go evidence and supportable operational signals.
