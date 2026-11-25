# Iteration 06 - Acceptance Test Plan

## Acceptance Scenarios

1. Cross-tenant read attempt fails.
2. Cross-tenant write attempt fails.
3. Provider credentials are encrypted at rest.
4. Logs redact secrets and sensitive provider credentials.
5. Metrics expose scan success, queue lag, provider errors, summary cost and delivery failures.
6. Dashboards show MVP health.
7. Alerts trigger for provider outage, queue backlog and cost spike.
8. CI blocks breaking OpenAPI diff.
9. CI blocks unsafe migration.
10. Backup restore is verified.
11. Worker shutdown does not corrupt in-flight scan.
12. Quotas prevent one tenant from starving others.

## Negative Scenarios

1. Provider outage creates bounded retry behavior.
2. Dead-letter queue growth becomes visible.
3. AI cost spike triggers alert/limit.
4. Revoked provider credential fails safely.
5. Migration failure blocks deploy.

## Regression Checks

- Tenant context is required in worker jobs.
- Correlation and causation IDs remain in events/logs.
- Contract checks stay in CI.
- Runbooks reference real dashboards and metrics.

## Pass Criteria

Hardening is accepted when support can diagnose and operate the MVP without developer shell access.
