# Iteration 06 - Build Order Checklist

## Build Order

1. Add tenant isolation guards. REST boundary guards completed for current MVP API surface.
2. Add tenant isolation tests. REST negative e2e coverage completed for current MVP API surface.
3. Encrypt provider credentials.
4. Add secret redaction.
5. Add structured logs.
6. Add correlation/causation IDs.
7. Add scan metrics.
8. Add queue metrics.
9. Add provider metrics.
10. Add AI cost metrics.
11. Add dashboards.
12. Add alert thresholds.
13. Add OpenAPI diff CI check.
14. Add migration CI check.
15. Add event schema compatibility check.
16. Add load/cost tests.
17. Verify backup/restore.
18. Write runbooks.

## First PR Sequence

1. PR 1: tenant scope guards and cross-tenant negative tests. REST scope guard and ingestion worker queue scope guard slices completed; remaining follow-up is event tenant context assertions if new gaps are found.
2. PR 2: credential encryption, secret redaction and safe error/log policy.
3. PR 3: audit taxonomy and security-sensitive action events.
4. PR 4: quota preflight and usage ledger enforcement.
5. PR 5: observability contract, safe labels and correlation propagation.
6. PR 6: dashboards, alerts and runbooks for source/scan/summary/DLQ.
7. PR 7: CI gates for architecture, contracts, migrations and generated clients.
8. PR 8: release evidence bundle gate completed for MVP; secret/dependency/container scanning remains the next supply-chain expansion before production hardening beyond beta.
9. PR 9: performance/cost tests and noisy-tenant fairness.
10. PR 10: staging drills for provider outage, DLQ growth and restore.

## Contracts First

- Security policies.
- Observability naming.
- CI gate definitions.
- Quota policy.
- Runbook templates.
- Redaction matrix.
- Audit event taxonomy.
- SLO/alert baseline.
- Release evidence bundle format.

## Tests And Checks

- Cross-tenant negative tests. REST scope-missing negative e2e exists for webhooks, API keys, delivery reads, feed, summary and monitoring; queue scope-missing e2e exists for ingestion worker scan command.
- Secret redaction tests.
- Migration from clean database.
- Contract diff check.
- Queue backlog simulation.
- Cost spike simulation.
- Worker/event missing tenant context tests.
- Redaction tests across logs/traces/errors/crashes.
- Usage ledger assertions.
- Backup/restore drill evidence.
- Safe-label metrics review.

## Edge Cases Before Closure

- Missing `x-tenant-id` or `x-workspace-id` must return controlled `tenant.scope_missing` problem details before any use case runs.
- Missing `tenantId` or `workspaceId` in queue payloads must return controlled `tenant.scope_missing` before any worker use case runs.
- Worker killed mid-scan.
- Provider outage.
- Retry storm.
- One tenant overloads system.
- Backup restore misses outbox state.
- Support dashboard exposes raw source content.
- Alert fires without actionable runbook.
- CI passes with stale generated contract.
- Quota check happens after provider/AI cost is incurred.

## Closure

Close only when support can diagnose failures without developer shell access.
