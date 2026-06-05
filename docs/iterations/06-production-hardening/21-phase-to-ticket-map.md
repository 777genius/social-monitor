# Iteration 06 - Phase To Ticket Map

| Phase | Ticket Groups | Key Artifacts | Closure Evidence |
| --- | --- | --- | --- |
| 01-security-privacy-controls | Tenant isolation, credentials, redaction | Security controls | Cross-tenant tests pass |
| 02-observability-sre | Metrics, dashboards, alerts, runbooks | Ops visibility | Support can diagnose |
| 03-ci-cd-supply-chain | OpenAPI diff, migrations, schema checks | CI gates | Unsafe changes blocked |
| 04-performance-cost-tests | Load, quota, cost, backup/restore | Reliability checks | Degradation is bounded |

## Ticket Cutting Rule

Each hardening ticket must state operational signal, failure mode and support/runbook impact.

## Traceability Rule

Before a ticket is ready, map it to `08-ticket-breakdown.md`, `11-acceptance-test-plan.md`, `14-traceability-matrix.md` and `59-traceable-evidence-register.md`. If the ticket cannot produce evidence, split or rewrite it.
