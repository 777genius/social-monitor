# Iteration 06 - Ticket Breakdown

## Phase 01 - Security Privacy Controls

### T06-01 - Enforce Tenant Isolation

- Context: Platform Security
- Layer: Application/persistence/tests
- Artifacts: tenant scope middleware, repository guards, isolation tests
- Steps:
  1. Require tenant context for commands and queries.
  2. Add repository-level tenant filters.
  3. Add cross-tenant negative tests.
  4. Add audit log for sensitive operations.
- Edge cases:
  - Background worker lacks tenant context.
  - Admin endpoint accidentally bypasses filters.
- Acceptance:
  - Cross-tenant access tests fail closed.

### T06-02 - Secure Provider Credentials

- Context: Source Catalog/Ingestion
- Layer: Infrastructure/security
- Artifacts: encrypted credential storage, rotation policy, redaction
- Steps:
  1. Encrypt provider tokens.
  2. Redact logs and errors.
  3. Add credential rotation path.
  4. Add access audit.
- Edge cases:
  - Provider error includes token in payload.
  - Credential revoked during scan.
- Acceptance:
  - Secrets never appear in logs or API responses.

## Phase 02 - Observability SRE

### T06-03 - Add Operational Dashboards

- Context: SRE
- Layer: Observability
- Artifacts: metrics, dashboards, alert rules
- Steps:
  1. Track scan latency and failure rates.
  2. Track queue lag and dead letters.
  3. Track provider errors by class.
  4. Track AI cost and summary failures.
  5. Add runbook links.
- Edge cases:
  - Provider outage floods alerts.
  - Metrics miss tenant dimension.
- Acceptance:
  - On-call can identify source, tenant and failure class.

## Phase 03 - CI CD Supply Chain

### T06-04 - Harden CI/CD

- Context: DevOps
- Layer: CI/CD
- Artifacts: pipeline checks, contract diffs, image build
- Steps:
  1. Add lint/typecheck/tests.
  2. Add migration validation.
  3. Add OpenAPI diff check.
  4. Add event schema compatibility check.
  5. Add dependency scan.
- Edge cases:
  - Breaking API change slips into mobile.
  - Migration passes locally but fails from clean database.
- Acceptance:
  - CI blocks unsafe contract, migration and dependency changes.

## Phase 04 - Performance Cost Tests

### T06-05 - Add Load And Cost Gates

- Context: Platform/Summarization/Ingestion
- Layer: Tests/operations
- Artifacts: load scripts, cost tests, quotas
- Steps:
  1. Simulate many topics and scan jobs.
  2. Measure queue lag and DB pressure.
  3. Simulate provider failures.
  4. Simulate summary cost spikes.
  5. Add per-tenant quotas.
- Edge cases:
  - One tenant starves workers.
  - Retry storm amplifies provider outage.
- Acceptance:
  - System degrades predictably under load and budget limits.
