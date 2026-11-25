# Iteration 06 - Definition Of Done

## Done Checklist

1. Tenant isolation tests pass.
2. Provider credentials are encrypted.
3. Secret redaction works.
4. Structured logs exist.
5. Correlation/causation IDs exist.
6. Metrics cover scan, queue, provider, AI cost and delivery.
7. Dashboards exist.
8. Alerts exist.
9. OpenAPI diff check exists.
10. Migration check exists.
11. Event schema compatibility check exists.
12. Load/cost tests exist.
13. Quotas exist.
14. Backup/restore is verified.
15. Runbooks exist.

## Architecture Done

- Security is enforced below controller layer.
- Workers carry tenant context.
- Retry budgets prevent storm behavior.
- Ops evidence maps to domain terms.

## Evidence Required

- Security test output.
- Redaction test output.
- Dashboard links or screenshots.
- CI gate output.
- Backup restore notes.
- Runbook links.

## Not Done If

- Support needs shell access for basic diagnosis.
- Cross-tenant negative tests are missing.
- Cost spike is invisible.
- Queue backlog is unbounded.
