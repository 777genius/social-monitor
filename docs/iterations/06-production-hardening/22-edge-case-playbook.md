# Iteration 06 - Edge Case Playbook

## Scenario - Cross-Tenant Data Leak

- Signal: Query returns data for wrong tenant.
- Validate: Negative tenant isolation tests.
- Mitigation: Repository guards, tenant context requirement and audit review.

## Scenario - Provider Outage Creates Retry Storm

- Signal: Queue lag spikes and provider errors repeat.
- Validate: Provider outage simulation.
- Mitigation: Circuit breaker, retry budget and source status degradation.

## Scenario - Secret Appears In Logs

- Signal: Credential/token found in log sample.
- Validate: Redaction tests.
- Mitigation: Central redaction layer and fail CI on leaks.

## Scenario - Cost Spike During Beta

- Signal: Summary cost metric crosses alert threshold.
- Validate: Cost spike simulation.
- Mitigation: Quotas, model fallback, summary frequency reduction.

## Scenario - Worker Processes Missing Tenant Context

- Signal: worker job or event has resource id but no tenant/workspace scope.
- Validate: malformed job/event fixture.
- Mitigation: fail closed, dead-letter with safe failure class and fix producer.

## Scenario - Support View Exposes Sensitive Data

- Signal: support dashboard/log includes raw source payload, prompt or credential.
- Validate: support redaction snapshot tests.
- Mitigation: central redaction, safe support DTOs and audit access.

## Scenario - DLQ Grows Silently

- Signal: failed jobs accumulate but no alert or owner action.
- Validate: DLQ growth staging drill.
- Mitigation: DLQ metrics, alert, owner, runbook and repair workflow.

## Scenario - Backup Restore Misses Operational Tables

- Signal: restored DB has business rows but outbox/inbox/idempotency state is inconsistent.
- Validate: restore drill with queued jobs/events.
- Mitigation: include operational tables in restore plan and document replay/repair steps.

## Scenario - CI Contract Drift

- Signal: backend changes OpenAPI/event schema but mobile/consumer still expects old contract.
- Validate: generated-client drift and event compatibility checks.
- Mitigation: block merge until contracts and mapper tests are updated.

## Scenario - Quota Check Happens Too Late

- Signal: provider/AI cost is incurred before system rejects over-quota request.
- Validate: quota preflight test around provider/AI adapter calls.
- Mitigation: enforce quota in use case before adapter call and record rejection in usage ledger.
