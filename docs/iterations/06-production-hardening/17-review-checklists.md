# Iteration 06 - Review Checklists

## Security Review

1. Tenant isolation is enforced below controller layer.
2. Worker jobs carry tenant context.
3. Provider credentials are encrypted.
4. Logs redact secrets.
5. Cross-tenant negative tests pass.

## SRE Review

1. Metrics cover scan, queue, provider, summary, cost and delivery health.
2. Dashboards map failures to domain terms.
3. Alerts link to runbooks.
4. Retry budgets prevent storm behavior.

## CI/CD Review

1. OpenAPI diff check exists.
2. Migration check exists.
3. Event schema compatibility check exists.
4. Backup/restore is verified.
