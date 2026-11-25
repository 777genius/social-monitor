# Iteration 06 - Detailed Execution Plan

## Purpose

Harden the MVP so real beta usage does not create security, privacy, cost or reliability failures.

## Phase 01 - Security Privacy Controls

### Steps

1. Enforce tenant scoping in repositories.
2. Add RBAC permissions.
3. Add auth/session validation.
4. Add audit log.
5. Add data classification.
6. Add retention policy.
7. Add source rights flags.
8. Add DSAR/delete/export manual workflow.
9. Add support-safe redaction.

### Security Implementation Steps

1. Define permission matrix for owner, admin, member and support.
2. Add tenant/workspace scope types to command/query contexts.
3. Enforce scoped repository signatures for tenant-owned data.
4. Add negative tests for cross-tenant API, repository, worker and event access.
5. Encrypt provider credentials and webhook/API secrets at rest.
6. Add central redaction helpers for logs, errors, traces and crash payloads.
7. Add audit event publisher for auth, source credential, API key, support/admin and deletion actions.
8. Add source rights and AI permission checks before summary/provider calls.
9. Add manual DSAR/export/delete runbook with retention exceptions.
10. Add support-safe views for source, scan, summary and delivery status.

### Edge Cases

- Async event missing tenant id.
- Admin sees raw source content unnecessarily.
- Deleted topic still appears in digest.
- AI request includes content disallowed by source rights.
- Support sees raw source payload while diagnosing source failure.
- Source credential rotates while worker job uses old credential reference.
- Event replay processes data after user access was revoked.

### Acceptance Gate

- Tenant isolation tests pass.
- Sensitive actions are audited.
- Redaction and tenant-scope tests pass across API, repository, worker and event consumers.

## Phase 02 - Observability SRE

### Steps

1. Add structured logs.
2. Add OpenTelemetry traces.
3. Add metrics:
   - scan success/failure
   - provider latency
   - queue lag
   - AI cost
   - summary failures
4. Add dashboards.
5. Add alerts.
6. Add runbooks.
7. Add source health view.
8. Add safe metric label policy.
9. Add support triage dashboard.
10. Add alert-to-runbook links.
11. Add user-visible status mapping for backend failures.

### Observability Implementation Steps

1. Define log fields and safe labels.
2. Propagate correlation/causation ids across REST, outbox, queue, worker and provider calls.
3. Add metrics for API, jobs, providers, feed, summaries, realtime, delivery and usage.
4. Add dashboards grouped by user-visible failure class.
5. Add alert rules only with action/runbook owner.
6. Add DLQ dashboard and repair workflow.
7. Add backup/restore drill and evidence capture.
8. Add staging drills for provider outage, summary failure and queue backlog.
9. Add support triage taxonomy mapping backend failures to UI recovery actions.
10. Add beta incident template.

### Edge Cases

- Provider outage looks like user configuration error.
- Queue lag hides scan failures.
- Logs include provider token.
- Metric label includes raw URL, prompt text or user email.
- Summary failure is visible to operators but not understandable to user/support.
- DLQ grows but no owner or action path exists.
- Metric label accidentally includes source URL or prompt.
- Trace breaks between outbox dispatcher and worker.
- Alert fires but runbook has no safe mitigation.

### Acceptance Gate

- Operator can diagnose source failure without database spelunking.
- Support can map scan/source/feed/summary/delivery failures to user-visible status and next action.
- SLO dashboards and runbook-linked alerts are tested in staging drills.

## Phase 03 - CI/CD Supply Chain

### Steps

1. Add lint and boundary checks.
2. Add unit/integration tests.
3. Add contract tests.
4. Add migration tests.
5. Add container build.
6. Add dependency vulnerability scanning.
7. Add generated client drift check.
8. Add deployment smoke tests.

### CI/CD Implementation Steps

1. Add architecture boundary checks.
2. Add OpenAPI generation drift and mobile generated-client drift checks.
3. Add event schema compatibility check.
4. Add migration clean/upgrade tests.
5. Add secret, dependency and container scans.
6. Add SBOM generation.
7. Add deploy smoke test for health, migration version and API contract.
8. Add release evidence bundle: commit, image digest, contracts, migration state and test summary.

### Edge Cases

- OpenAPI generated differently on two machines.
- Dependency update changes transitive behavior.
- Migration passes locally but fails on clean DB.
- CI cache masks stale generated artifacts.
- Event consumer compatibility is not tested before producer deploy.
- Security scan exception becomes permanent.

### Acceptance Gate

- CI blocks unsafe architecture and contract drift.
- Release artifact and evidence bundle exist before beta deploy.

## Phase 04 - Performance Cost Tests

### Steps

1. Load test topic creation.
2. Load test scheduled scan burst.
3. Load test feed reads.
4. Load test summary generation queue.
5. Add AI cost budget tests.
6. Add provider rate-limit simulation.
7. Add noisy topic simulation.
8. Add source outage simulation.

### Performance/Cost Implementation Steps

1. Define beta capacity envelope.
2. Add usage ledger assertions for scans, AI and delivery.
3. Add quota preflight tests before provider/AI calls.
4. Add noisy tenant fairness test.
5. Add provider rate-limit/circuit-breaker simulation.
6. Add summary token/cost regression test.
7. Add queue lag/backpressure test.
8. Add DB hot-query EXPLAIN review for feed/status endpoints.
9. Add documented degradation behavior for over-quota, source outage and summary backlog.

### Edge Cases

- One tenant exhausts provider quota.
- Summary queue delays digests.
- Broad query creates excessive AI spend.
- Worker autoscaling increases provider rate-limit failures.
- Feed reads slow down after retention grows.
- Retry storm consumes quota faster than useful work.

### Acceptance Gate

- System has documented limits, quotas and degradation behavior.
- Load/cost tests prove the beta capacity envelope or document a smaller safe launch scope.
