# Iteration 06 - Risk-Based Priority

## Priority 1 - Tenant Isolation

- Risk: Cross-tenant data leak is catastrophic.
- Do First: Repository guards and negative tests.
- Do Not Defer: Worker tenant context.

## Priority 2 - Secret Redaction And Credential Security

- Risk: Provider credentials leak through logs or storage.
- Do First: Encryption and redaction tests.

## Priority 3 - Observability For Core Failures

- Risk: Support cannot diagnose scans, provider failures or summaries.
- Do First: Metrics, dashboards and runbooks.

## Priority 4 - CI Gates

- Risk: Breaking API/migration/event changes reach beta.
- Do First: OpenAPI diff, migration check, schema compatibility.
