# Iteration 06 - Production Hardening Overview

## Goal

Make the MVP safe enough for real beta users.

This iteration covers security, privacy, observability, CI/CD, cost control and operational readiness. It is not optional because the product handles user-configured monitoring, external APIs and AI processing.

## Phase Map

1. `01-security-privacy-controls.md` - auth, tenant isolation, privacy and data boundaries.
2. `02-observability-sre.md` - logs, metrics, traces, SLOs and runbooks.
3. `03-ci-cd-supply-chain.md` - pipelines, tests, artifacts and dependency controls.
4. `04-performance-cost-tests.md` - load, quota, AI/source cost tests.

## MVP Hardening Cutline

Build before beta:

1. tenant isolation tests across API, repositories, workers and event consumers
2. credential encryption and redaction
3. audit events for critical actions
4. quota preflight before provider/AI calls
5. usage ledger for scan, AI and delivery cost evidence
6. logs/metrics/traces with safe labels
7. dashboards and runbooks for scan/source/feed/summary/delivery failures
8. CI gates for architecture, contracts, migrations, generated clients and secrets
9. backup/restore drill
10. source/provider outage and queue backlog drills

Defer:

1. SOC2/ISO-style formal certification
2. multi-region active-active
3. full enterprise DLP
4. advanced billing suite
5. mature chaos engineering program
6. public status page automation

## Beta Blockers

The MVP must not enter beta if any are true:

1. cross-tenant access is reproducible
2. provider credential or token can appear in logs/traces/crashes
3. provider/AI call can bypass quota preflight
4. final summary can be displayed without citations
5. worker can process tenant-owned job/event without tenant/workspace scope
6. support cannot classify common scan/source/feed/summary/delivery failures
7. CI does not block OpenAPI/event/schema drift
8. backup restore has not been tested

## Detailed Steps

1. Add RBAC/ABAC policies for tenants and roles.
2. Add row-level tenant scoping or equivalent enforced repository policy.
3. Add audit log for admin/security-sensitive actions.
4. Add API rate limits and request body limits.
5. Add secret management policy.
6. Add PII/data classification tags.
7. Add source terms/data-rights flags.
8. Add OpenTelemetry traces across API, worker and brokers.
9. Add Prometheus metrics for scans, provider errors, queues and AI spend.
10. Add SLO dashboards.
11. Add CI pipeline for lint/unit/integration/contract tests.
12. Add container build and vulnerability scanning.
13. Add migration tests.
14. Add load tests for scan bursts and feed reads.
15. Add chaos/failure drills for provider outage and broker outage.

## Edge Cases

- Tenant id missing in async event metadata.
- User tries to access another workspace feed item.
- Provider returns sensitive user data unexpectedly.
- AI provider logs or stores prompts differently than expected.
- Queue backlog grows beyond digest deadline.
- Cost spike from user-created broad query.
- Migration deploys while workers are running.
- Source adapter leaks provider token in logs.
- Support/admin export accidentally includes raw source payloads.
- Event replay after bug fix reprocesses tenant data with old authorization assumptions.
- Alert fires for cost spike but quota enforcement is missing.
- Backup restore loses outbox/inbox/idempotency operational state.
- Dependency update changes generated OpenAPI output.

## Pay Attention

- Security controls must be tested, not just configured.
- Cost control is a product reliability feature.
- Observability must include business identifiers safely: tenant id hash, source id, provider id, job id.
- Support tooling must use redacted views by default.
- Every hardening control needs a test, drill or dashboard evidence.
- Avoid noisy alerts; every alert must link to an action.
- Cost control and source policy are reliability controls, not billing-only features.

## Quality Gates

- Tenant isolation tests are mandatory.
- No secret appears in logs/test snapshots.
- All external calls have timeout and retry budget.
- Dashboards show scan success, provider errors, queue lag and AI spend.
- CI blocks forbidden imports and contract drift.
- Load test has defined acceptance thresholds.
- Beta go/no-go references hardening evidence, not verbal confidence.
- Operational runbooks are linked from alerts and tested in staging.

## Done Criteria

Iteration 06 is complete when the MVP can survive normal beta usage, source failures and AI/provider incidents without silent data leaks or uncontrolled cost.
