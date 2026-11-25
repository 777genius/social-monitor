# Iteration 06 - Implementation Risk Triage

## Triage Goal
Detect beta-safety risks before users enter the system.

## Critical Risks
- Cross-tenant access is possible through API, worker, event or realtime paths.
- Secrets can leak through logs, traces or provider errors.
- CI does not block breaking contracts or migrations.
- Support cannot diagnose common failures.

## Early Warning Signals
- Tests cover REST but not workers/read models.
- Provider errors include raw request/response metadata.
- Dashboards show infra health but not user-visible failures.
- Quotas are configurable but not enforced.

## Owners
- Security owner owns tenant isolation and redaction.
- SRE owner owns observability and recovery.
- Backend lead owns CI gates and quotas.
- Support owner owns diagnostic readiness.

## Mitigations
- Add negative tests across all data paths.
- Redact secrets at logging boundary and provider adapter boundary.
- Make contract/migration/event checks blocking.
- Add dashboards for scan, summary, queue, cost and delivery failures.

## Stop-Work Triggers
- Any cross-tenant data access is reproducible.
- Any credential appears in logs/traces/errors.
- Beta launch depends on undocumented shell diagnosis.

## MVP Risk Cutline
- Fix now: tenant isolation, redaction, CI gates, quotas, backup/restore and support diagnostics.
- Carry with owner: dashboard polish and alert threshold tuning.
- Defer: enterprise compliance, multi-region and advanced chaos suites.
