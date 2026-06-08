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
- PR 3 manual scan request audit added in commit `c1f6065`: user-triggered scan jobs record support-safe audit events and skip idempotent/overlap responses that do not enqueue new work.
- PR 4 manual scan quota preflight added in commit `a6ec5d6`: manual scan requests reserve tenant/workspace quota through Usage before scan job creation/enqueue, and quota overflow returns `operation.quota_exceeded` without adding queue work.
- PR 4 summary request quota preflight added in commit `0862f56`: summary request/regeneration use cases reserve tenant/workspace quota before summary job creation, and HTTP e2e confirms quota overflow returns `operation.quota_exceeded` without creating a second summary job.
- PR 5 request context contract added in commit `2e14638`: request/correlation/causation headers are normalized to safe bounded IDs, unsafe values fall back to generated request IDs and health e2e verifies response propagation.
- PR 5 safe observability labels added in commit `f622ed4`: platform logging normalizes unsafe/high-cardinality string fields to `unknown` after secret redaction, giving metrics/log labels a shared safe-value helper.
- PR 5 scan request correlation propagation added in commit `ee0fdf3`: manual scan REST requests now use the shared request-context helper and e2e verifies `x-correlation-id` reaches the `ingestion.scan.execute` queue envelope.
- PR 5 scan queue metrics added in commit `ef9619b`: platform metrics port/in-memory adapter records safe low-cardinality queue enqueue counters, and Monitoring REST wires the adapter without leaking metrics concerns into domain/features.
- PR 5 ingestion scan execution metrics added in commit `96bb354`: ingestion queue handler records started/succeeded/failed scan job counters with safe labels at the interface boundary while keeping execute-scan use case/domain metrics-free.
- PR 5 scan status support state added in commit `373f86e`: scan status REST responses include support-safe `userState`, `failureClass` and `operatorAction` fields from a presentation-layer mapping policy.
- PR 5 scan queue backlog metric added in commit `09962da`: platform metrics supports gauges and Monitoring queue adapter records `queue_commands_backlog` for scan enqueue depth with safe labels.
- PR 6 MVP observability contract added in commit `f92fc3c`: versioned dashboard and alert definitions reference implemented MVP metrics, safe labels and runbook sections, with `npm run check:observability` validating links and unsafe labels.
- PR 6 observability CI gate added in commit `9c9c405`: `npm run verify` now runs `check:observability` so dashboard/alert contracts are checked with the standard local/CI verification path.
- PR 6 scan failure queue observability added in commit `f5b50e7`: retry and DLQ queues record safe counters/gauges, MVP dashboard/alert definitions include DLQ panels and alert, and the runbook includes DLQ triage steps.
- PR 6 provider failure observability added in commit `35484e7`: ingestion scan failures now emit provider outage/rate-limit failure-class counters, MVP dashboard/alert definitions include provider failure panels and alerts, and the runbook includes provider triage steps.
- PR 6 summary model cost observability added in commit `064f747`: summary model execution now emits low-cardinality request/token/cost metrics through a `SummaryModelPort` adapter, dashboard/alert definitions include cost panels and the runbook includes summary cost triage.
- PR 6 delivery observability added in commit `cc90c93`: delivery provider adapters now emit attempt/failure counters through a `DeliveryProviderPort` decorator, dashboard/alert definitions include retryable webhook delivery failures, and the runbook includes delivery failure triage without exposing raw webhook secrets or payload credentials.
- PR 7 OpenAPI drift gate added in commit `7bb904a`: headless Nest Swagger generation writes a committed REST snapshot, `npm run check:openapi` blocks unreviewed drift, and `npm run verify` now includes the OpenAPI contract gate.
- PR 7 migration schema gate added in commit `7ef3cd8`: `npm run check:migrations` now validates Prisma schema, regenerates the client and renders a clean from-empty SQL diff with destructive-statement sanity checks.
- PR 7 event schema compatibility gate added in commit `c03ae09`: committed event catalog plus `npm run check:events` validates producer event type/schema coverage and keeps webhook/realtime/internal event contracts explicit in `verify`.
- PR 8 release evidence gate added in commit `bf95ab3`: `ops/release/mvp-release-evidence-contract.json` defines required beta release artifact evidence, blocking gates, deploy smoke checks and rollback triggers, and `npm run check:release` is included in `verify`.
- PR 8 secret scan gate added in commits `38bd2fc`, `7858155`: `npm run check:secrets` scans tracked source/config/docs files for private keys, secret-like env assignments, bearer/API/webhook token literals and credential URLs, with an explicit allowlist for local/test placeholders only.
- PR 8 dependency audit gate added in commit `5aa4d04`: `npm run check:dependencies` runs `npm audit --json --audit-level=high`, blocks high/critical advisories and requires owner/expiry/mitigation for any future exception.
- PR 8 container release contract added in commit `1ad1469`: Dockerfile, `.dockerignore` and `npm run check:container` validate MVP image build markers, service targets, non-root runtime, SBOM/signing/digest evidence policy and the current ts-node runtime limitation.
- PR 9 load/cost guardrail added in commit `46dfbf1`: deterministic quota simulation verifies noisy scan tenant isolation, quiet tenant fairness and summary cost budget rejection through `npm run check:load-cost`.
- PR 10 backup/restore contract gate added in commit `a896050`: recovery contract lists all Prisma tables and operational replay/idempotency state, and `npm run check:backup-restore` validates schema coverage plus runbook linkage.
- PR 10 staging drill contract gate added in commit `ab8c261`: `ops/drills/mvp-staging-drills.json` records provider outage, provider rate-limit, DLQ growth, summary cost and restore drills with alert/runbook/verification coverage.
- PR 11 provider circuit breakers added in commit `d0dae51`: ingestion source fetching and delivery providers now use adapter-level circuit breakers with failure thresholds and cooldown windows, preserving Clean Architecture while preventing provider outage retry storms.
- PR 11 scan queue backpressure added in commit `3961f61`: manual and scheduled scan enqueue paths now preflight `ScanQueuePort.canAccept`, the queue adapter enforces bounded depth with safe rejected/backlog metrics, manual requests fail before quota/job/outbox work, and scheduled scans skip without advancing `nextRunAt` when backlog is full.
