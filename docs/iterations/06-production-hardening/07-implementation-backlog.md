# Iteration 06 - Implementation Backlog

## Purpose

Make the MVP reliable enough for beta users: security, observability, CI/CD, resilience, privacy and cost control.

## Security Backlog

1. Enforce tenant isolation in every query. REST boundary header-scope guards are implemented for webhooks, API keys, delivery reads, feed, summary and monitoring.
2. Add authorization policies per workspace role.
3. Add audit log for sensitive changes.
4. Add secret management strategy.
5. Add API rate limiting.
6. Add input validation and output encoding.
7. Add dependency vulnerability scanning.
8. Add provider credential encryption.

## Observability Backlog

1. Add structured logs.
2. Add trace IDs and correlation IDs.
3. Add metrics for scan success, latency, queue lag, provider failures, summary cost and delivery failures.
4. Add dashboards for MVP operations.
5. Add alert thresholds.
6. Add runbooks for common incidents.

## Reliability Backlog

1. Add retry budgets.
2. Add circuit breaker strategy for provider adapters.
3. Add dead-letter inspection workflow.
4. Add backpressure rules.
5. Add data retention jobs.
6. Add backup/restore verification.
7. Add graceful shutdown for workers.

## CI/CD Backlog

1. Add lint/typecheck/test pipeline.
2. Add migration check.
3. Add OpenAPI diff check.
4. Add event schema compatibility check.
5. Add Docker image build.
6. Add staging deploy pipeline.
7. Add smoke tests.

## Edge Cases

- One tenant creates noisy workload and harms others.
- Provider outage creates queue backlog.
- AI provider cost spikes after prompt change.
- Migration partially applies.
- Worker is killed while processing a scan.
- Logs accidentally contain provider credentials or source payload secrets.

## Validation

- Tenant isolation tests pass.
- Operational dashboard explains current system health.
- Queue backlog is bounded and visible.
- CI blocks unsafe contract and migration changes.

## Implemented Evidence

- PR 1 tenant-scope guards completed in commits `739d203`, `dd8e814`, `55f6154`, `ee8a44e`, `fa53fa7`, `86c4958`, `ce816b0`.
- Covered REST contexts: delivery webhooks, API keys, delivery read models, feed, summary and monitoring.
- Covered queue contexts: ingestion worker `ingestion.scan.execute` command handler.
- Required REST adapter pattern: `requireTenantScope({ tenantIdHeader, workspaceIdHeader })` before invoking use cases.
- Required queue adapter pattern: reject missing tenant/workspace payload with controlled `tenant.scope_missing` before invoking use cases.
- Confirmed no direct `tenantId(tenantHeader)` or `workspaceId(workspaceHeader)` conversions remain in `libs` or `apps`.
- Verification used: `npm run check:architecture`, `npm run build`, targeted e2e specs, targeted ESLint and `git diff --check`.
- PR 2 redaction foundation started in commit `5fb7aef`: structured logging redacts secret-like field names and generated/Bearer/URL-password secret-like values.
- PR 2 source credential-at-rest protection added in commit `a97b0cd`: source binding config secret-like fields are protected through a Clean Architecture port and AES-256-GCM adapter before repository persistence.
- PR 2 safe API error details added in commit `4ebcfd1`: `DomainErrorFilter` recursively redacts secret-like problem detail keys and values before returning JSON to clients.
- PR 3 audit hardening started in commit `947af79`: public API audit records include outcome/reason-code fields and redact secret-like metadata before append.
- PR 3 API key lifecycle audit added in commit `28cb17f`: API key create/list/revoke REST actions record support-safe audit events through the Usage use case, with `system` actor taxonomy for the current pre-user-auth MVP boundary.
- PR 3 source binding audit added in commit `9efc707`: source binding creation records support-safe audit events without storing source config or credentials, and idempotent duplicate binding calls do not create false new security-change audit records.
- PR 3 scan policy audit added in commit `a72160c`: scan policy creation records support-safe interval/freshness/retry metadata and skips duplicate idempotent replay events.
