# Iteration 06 - Final Go/No-Go Checklist

## Decision Scope
Decide whether the MVP is safe enough for controlled beta launch.

## Go Conditions
- Tenant isolation gates are green.
- Secrets are encrypted and redacted.
- CI blocks breaking contracts, events and migrations.
- Dashboards cover user-visible failures.
- Quotas and backup/restore checks pass.
- Support runbooks are ready.

## Hold Conditions
- Enterprise compliance is incomplete.
- Advanced autoscaling is deferred.

## Rework Conditions
- Cross-tenant access is reproducible.
- Secret appears in logs/traces/errors.
- Breaking contract passes CI.
- Support needs shell access for common failures.

## Accepted Exceptions
- Incident automation can mature after beta.
- Enterprise certifications can remain post-MVP.

## Critical Audit Evidence
- Critical MVP Gap Audit is green or accepted exceptions are owned.
- Failure Propagation Matrix is covered by API/mobile/support evidence.
- Support, quota, restore, DLQ and provider outage drills have evidence.
- Delete/export/retention workflow has owner, exceptions and audit trail.
- Deploy/migration/replay race behavior has pause/drain/re-check evidence.
- Capacity envelope and degradation drills prove safe behavior under backlog, noisy tenant, provider pressure and AI cost spike.

## Decision Record
Record decision as `go`, `hold` or `rework` with security, CI, dashboard, quota and support evidence.
