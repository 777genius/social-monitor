# Iteration 06 - Quality Gates And Risk Register

## Hard Gates

1. Tenant isolation tests pass.
2. Provider credentials are encrypted.
3. Logs redact secrets.
4. Metrics cover scan, queue, provider, summary, cost and delivery health.
5. Dashboards exist.
6. Alert thresholds exist.
7. CI blocks breaking OpenAPI changes.
8. CI blocks unsafe migrations.
9. Cost/quota limits are enforced.
10. Backup/restore is verified.

## Architecture Checks

- Security is enforced in use cases/repositories, not only controllers.
- Worker jobs carry tenant context.
- Observability includes correlation and causation IDs.
- Retry budgets prevent storm behavior.
- Operational runbooks reference real metrics and failure states.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Cross-tenant data leak | Critical | Tenant-scope tests and repository guards. |
| Provider outage creates retry storm | System instability | Circuit breaker, backoff and queue visibility. |
| AI cost spike | Budget failure | Quotas, alerts and per-summary telemetry. |
| Logs leak secrets | Security incident | Redaction tests and credential encryption. |
| Migration fails during deploy | Downtime/data risk | Migration check and rollback plan. |

## Edge Cases To Recheck

- Worker killed mid-scan.
- One tenant creates a noisy workload.
- Dead-letter queue grows unnoticed.
- Provider credential is revoked.
- Backup restore misses outbox/event state.

## Transition Criteria

Move to Iteration 07 only when the MVP can be operated, diagnosed and rolled back without direct developer shell access.
