# Iteration 06 - Phase Step Matrix

## Phase 01 - Security Privacy Controls

### Build Steps

1. Enforce tenant scoping.
2. Add RBAC.
3. Add audit logs.
4. Add data classification.
5. Add retention controls.
6. Add source rights checks.
7. Add support redaction.
8. Add export/delete workflow.

### Dependencies

- Stable data model.

### Edge Cases

- Async event lacks tenant id.
- Support sees raw sensitive data.
- AI receives disallowed content.

### Validation

- Tenant isolation tests pass.

## Phase 02 - Observability SRE

### Build Steps

1. Add logs.
2. Add traces.
3. Add metrics.
4. Add dashboards.
5. Add alerts.
6. Add runbooks.
7. Add source health views.

### Dependencies

- Workers and providers.

### Edge Cases

- Provider outage looks like user error.
- Queue lag hides failure.
- Logs leak secrets.

### Validation

- Operator can debug scan failure quickly.

## Phase 03 - CI/CD Supply Chain

### Build Steps

1. Add lint.
2. Add unit tests.
3. Add integration tests.
4. Add contract tests.
5. Add migration tests.
6. Add image builds.
7. Add vulnerability scans.
8. Add generated client drift check.

### Dependencies

- Stable build scripts.

### Edge Cases

- Generated OpenAPI changes nondeterministically.
- Dependency update breaks runtime.

### Validation

- CI blocks unsafe changes.

## Phase 04 - Performance Cost Tests

### Build Steps

1. Test scan bursts.
2. Test feed reads.
3. Test summary queue.
4. Test AI cost budgets.
5. Test provider rate limits.
6. Test noisy topics.
7. Test source outage.

### Dependencies

- End-to-end MVP flow.

### Edge Cases

- One tenant starves provider quota.
- Broad query explodes AI spend.
- Summary queue delays alerts.

### Validation

- Limits and degradation behavior are documented.

