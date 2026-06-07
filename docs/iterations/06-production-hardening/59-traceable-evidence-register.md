# Iteration 06 - Traceable Evidence Register

## Evidence Goal
Prove that beta safety gates are enforced and supportable.

## Critical Audit Evidence
- Tenant isolation and redaction tests pass across API, worker, event and support paths.
- Quota preflight is proven before provider/AI calls.
- Support can diagnose common failures without raw payloads or shell/database access.
- Backup/restore, DLQ and provider outage drills have evidence.
- Manual delete/export workflow has owner, retention exceptions, support path and audit evidence.
- Deploy/migration drain and stale authorization replay behavior is documented and tested.
- Capacity envelope, degradation policy, noisy-tenant fairness and cost-burn evidence are attached.

## Decision Evidence
- Tenant isolation gate decision.
- Secret redaction policy.
- CI contract gate policy.
- Quota/cost-control decision.
- Observability baseline decision.

## Ticket Evidence
- Security tickets link to isolation and redaction test output.
- CI tickets link to breaking/non-breaking contract cases.
- Observability tickets link to dashboards.
- Recovery tickets link to backup/restore evidence.

## PR 1 Tenant Scope Evidence

- `739d203 feat: guard webhook tenant scope`
- `dd8e814 feat: guard api key tenant scope`
- `55f6154 feat: guard delivery read tenant scope`
- `ee8a44e feat: guard feed tenant scope`
- `fa53fa7 feat: guard summary tenant scope`
- `86c4958 feat: guard monitoring tenant scope`
- `ce816b0 feat: guard ingestion worker tenant scope`

Verified commands:

- `npm run check:architecture`
- `npm run build`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand ...` for the added tenant-scope e2e specs and related happy-path REST regressions.
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint ...` for changed files.
- `git diff --check`

Evidence notes:

- Missing tenant/workspace REST headers produce controlled `tenant.scope_missing` problem details.
- REST adapters guard scope before use case invocation.
- Missing tenant/workspace ingestion queue payload fields produce controlled `tenant.scope_missing` before worker use case invocation.
- No direct `tenantId(tenantHeader)` or `workspaceId(workspaceHeader)` conversions remain in current `libs`/`apps` scan.

## PR 2 Secret Redaction Evidence

- `5fb7aef feat: redact structured log secrets`
- `a97b0cd feat: protect source binding credentials`
- `4ebcfd1 feat: redact problem detail secrets`

Verified commands:

- `npm run check:architecture`
- `npm run build`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/platform/logging/src/structured-logger.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint libs/platform/logging/src/structured-logger.ts libs/platform/logging/src/structured-logger.spec.ts`
- `git diff --check`

Evidence notes:

- Structured logs redact secret-like field names such as `authorization`, `apiKey`, `refreshToken` and `webhookSecret`.
- Structured logs redact secret-like values such as `Bearer ...`, generated `smk_...`, generated `whsec_...` and URLs containing embedded passwords.
- Source binding configs protect secret-like fields through `SourceBindingConfigProtectorPort` before repository persistence.
- AES-256-GCM adapter encrypts recursive secret-like config keys such as `apiToken`, `password` and `authorization`.
- API problem details recursively redact secret-like keys and values before client response serialization.

## PR 3 Audit Taxonomy Evidence

- `947af79 feat: harden public api audit records`
- `28cb17f feat: audit api key lifecycle`
- `9efc707 feat: audit source binding creation`
- `a72160c feat: audit scan policy creation`
- `c1f6065 feat: audit manual scan requests`

Verified commands:

- `npm run check:architecture`
- `npm run build`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/webhook-endpoints.audit.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/api-keys.lifecycle.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/source-bindings.create.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/scan-policies.set.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/scan-requests.create.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint ...`
- `git diff --check`

Evidence notes:

- Public API audit records now carry `outcome` and optional `reasonCode`.
- Audit metadata is redacted in the use case before append, not only at the logging layer.
- Webhook endpoint management audit e2e verifies successful audit outcome and no raw API key/signing secret leakage.
- API key lifecycle e2e verifies create/revoke audit events and confirms the raw `smk_...` secret is not stored in audit records.
- `system` actor type is allowed for current MVP identity lifecycle actions until first-class user-auth actor identity is implemented.
- Source binding create e2e verifies one audit event for the real create path, no second event for an idempotent duplicate and no persisted audit `config` payload.
- Scan policy e2e verifies one audit event for the real create path, no second event for an idempotent duplicate and support-safe schedule metadata only.
- Manual scan request e2e verifies one audit event for the real enqueue path, no duplicate event for idempotent replay or overlap and support-safe source/job metadata only.

## Review Evidence
- Cross-functional hardening review is approved.
- Support owner confirms runbooks.
- SRE owner confirms dashboard and alert coverage.

## PR 4 Quota Preflight Evidence

- `a6ec5d6 feat: enforce manual scan quota`
- `0862f56 feat: enforce summary request quota`

Verified commands:

- `npm run build`
- `npm run check:architecture`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/usage/features/reserve-usage-quota/reserve-usage-quota.use-case.spec.ts libs/monitoring/features/request-scan/request-scan.use-case.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/summary/features/request-summary/request-summary.use-case.spec.ts libs/summary/features/regenerate-summary/regenerate-summary.use-case.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/scan-requests.quota.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/summary-requests.quota.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint ...`
- `git diff --check`

Evidence notes:

- Usage context owns the quota ledger port/use case and returns `operation.quota_exceeded` with reset/retry details.
- Monitoring depends on a local `ScanRequestQuotaPort`; the REST module wires a Usage-backed adapter, preserving feature/domain isolation.
- Manual scan e2e verifies quota overflow returns 429 before a second queue command is enqueued.
- Summary depends on a local `SummaryQuotaPort`; the REST module wires a Usage-backed adapter, preserving feature/domain isolation.
- Summary quota e2e verifies quota overflow returns 429 before a second summary job is persisted.

## Handoff Evidence
- Launch iteration accepts go/no-go evidence.
- Residual risks have owner and rollback trigger.

## PR 6 Dashboards Alerts Runbooks Evidence

- `f92fc3c feat: add mvp observability contract`
- `9c9c405 chore: include observability gate in verify`
- `f5b50e7 feat: record scan failure queue metrics`
- `35484e7 feat: record provider failure metrics`
- `064f747 feat: record summary model cost metrics`
- `cc90c93 feat: record delivery attempt metrics`

Verified commands:

- `npm run check:observability`
- `npm run check:architecture`
- `npm run build`
- `node -e "..."` operational contract smoke verified every MVP alert points to an existing dashboard panel and runbook path.
- `node -e "..."` verify-script smoke confirmed `npm run verify` includes `check:observability`.
- `node -r ts-node/register -r tsconfig-paths/register -e "..."` standalone DLQ queue unit verified dead-letter counter/backlog metrics.
- `node -r ts-node/register -r tsconfig-paths/register -e "..."` standalone ingestion worker e2e verified failing provider path enqueues retry and records retry queue counter/backlog metrics.
- `node -r ts-node/register -r tsconfig-paths/register -e "..."` standalone ingestion worker e2e verified provider-unavailable failure classification records `scan_failures_total{failure_class=provider_unavailable,job_type=scan,worker=ingestion-worker}`.
- `node -e "..."` provider observability contract smoke verified provider outage/rate-limit alerts point to matching dashboard panels and the provider triage runbook section.
- `node -r ts-node/register -r tsconfig-paths/register -e "..."` standalone Summary Nest e2e verified summary request execution records `summary_model_requests_total`, `summary_model_tokens_total` and `summary_model_estimated_cost_usd` through the real `SummaryRestModule` wiring.
- `node -r ts-node/register -r tsconfig-paths/register - <<'NODE' ...` standalone delivery adapter smoke/e2e verified accepted and retryable-failure delivery attempts record `delivery_attempts_total` and `delivery_failures_total`.
- `npm run build`
- `npm run check:architecture`
- `npm run check:observability`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint scripts/check-observability.mjs`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint libs/ingestion/interfaces/queue/execute-scan-command.handler.ts test/e2e/api-to-ingestion-contract.e2e-spec.ts test/e2e/ingestion-worker.execute-scan.e2e-spec.ts scripts/check-observability.mjs`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint libs/summary/adapters/model/metered-summary-model.adapter.ts libs/summary/interfaces/rest/summary-rest.module.ts test/e2e/summary-jobs.execute.e2e-spec.ts scripts/check-observability.mjs`
- `node --max-old-space-size=2048 ./node_modules/eslint/bin/eslint.js libs/delivery/adapters/notification/metered-delivery.provider.ts`
- `node --max-old-space-size=2048 ./node_modules/eslint/bin/eslint.js libs/delivery/adapters/notification/metered-delivery.provider.spec.ts`
- `node --max-old-space-size=2048 ./node_modules/eslint/bin/eslint.js libs/delivery/interfaces/rest/delivery-rest.module.ts scripts/check-observability.mjs`
- `git diff --check`

Evidence notes:

- `ops/observability/dashboards/mvp-health.json` defines MVP health panels for scan queue backlog, scan queue accepted work and ingestion worker started/failed counters.
- `ops/observability/alerts/mvp-alerts.json` defines actionable warning alerts for scan backlog growth and worker failures.
- Alerts link to `docs/iterations/06-production-hardening/12-operational-runbook.md` sections and include first mitigation plus user-visible state.
- `scripts/check-observability.mjs` rejects unknown metrics, unsafe/high-risk labels and missing runbook/dashboard references.
- This remains vendor-neutral so Prometheus/Grafana/OpenTelemetry adapters can be added later without rewriting the operational contract.
- The observability contract is now part of the standard `npm run verify` chain.
- Retry and DLQ failure queues now emit `scan_failure_queue_events_total` and `scan_failure_queue_backlog` with `queue/status` safe labels only.
- MVP health dashboard includes scan retry and scan DLQ backlog panels, and alerts include `scan-dlq-growth` linked to the DLQ triage runbook.
- Provider outage and provider rate-limit scan failures now emit the same low-cardinality `scan_failures_total` metric with `failure_class`, `job_type` and `worker` labels.
- MVP health dashboard includes provider outage/rate-limit failure panels, and alerts link to provider triage runbook steps without depending on a specific metrics vendor.
- Summary model metrics are recorded in `MeteredSummaryModelAdapter`, preserving Clean Architecture: domain/use cases still depend only on `SummaryModelPort`.
- Summary model observability uses low-cardinality labels only: `provider`, `model`, `status` and `token_type`; prompt text, source URLs and user identifiers remain forbidden labels.
- MVP health dashboard includes summary model cost/output token panels, and `summary-model-cost-spike` links to the summary cost triage runbook.
- Delivery metrics are recorded in `MeteredDeliveryProvider`, preserving Clean Architecture: delivery use cases still depend only on `DeliveryProviderPort`.
- Delivery observability uses low-cardinality labels only: `channel`, `resource_type`, `status` and `retryable`; raw provider failure reasons, webhook secrets, endpoint URLs and payload credentials remain forbidden metric labels.
- MVP health dashboard includes retryable webhook delivery failure coverage, and `webhook-delivery-failures` links to the delivery failure triage runbook.

## PR 5 Observability Contract Evidence

- `2e14638 feat: normalize request context headers`
- `f622ed4 feat: normalize safe observability labels`
- `ee0fdf3 feat: propagate scan request correlation id`
- `ef9619b feat: record scan queue metrics`
- `96bb354 feat: record ingestion scan metrics`
- `373f86e feat: expose scan status support state`
- `09962da feat: record scan queue backlog metric`

Verified commands:

- `npm run build`
- `npm run check:architecture`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/platform/request-context/src/request-context.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/platform/logging/src/safe-label.spec.ts libs/platform/logging/src/structured-logger.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/platform/metrics/src/metrics-recorder.spec.ts libs/monitoring/adapters/queue/in-memory-scan-queue.adapter.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/api-gateway.health.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/scan-requests.create.e2e-spec.ts`
- `node -r ts-node/register -r tsconfig-paths/register -e "..."` standalone Monitoring REST/supertest e2e verified topic -> source binding -> scan policy -> scan request -> queue -> metrics because repeated user interruptions killed long-running Jest e2e tool calls before final output could be captured.
- `node -r ts-node/register -r tsconfig-paths/register -e "..."` standalone ingestion worker e2e verified successful and failed `ExecuteScanCommandHandler` paths plus `scan_jobs_total` started/succeeded/failed counters.
- `node -r ts-node/register -r tsconfig-paths/register -e "..."` standalone Monitoring REST/supertest e2e verified scan status response includes `userState=scan_in_progress` and the expected support action for an enqueued scan.
- `node -r ts-node/register -r tsconfig-paths/register -e "..."` standalone queue backlog unit and Monitoring REST/supertest e2e verified `queue_commands_backlog=1` after scan request enqueue.
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint ...`
- `git diff --check`

Evidence notes:

- Request context IDs are bounded to 128 characters and limited to safe label characters.
- Unsafe request/correlation/causation headers are dropped rather than propagated to logs, traces or response headers.
- Health e2e verifies explicit safe IDs propagate and unsafe IDs fall back to generated request/correlation IDs.
- Logging safe-label helper preserves low-cardinality provider/status/job labels and maps emails, URLs, free-form prompt text and oversized strings to `unknown`.
- Structured logger applies secret redaction before safe-label normalization so generated API keys and bearer values remain `[REDACTED]`.
- Manual scan request REST adapter uses the shared request-context helper instead of directly generating ad hoc IDs.
- Scan request e2e verifies `x-correlation-id` propagates into the `ingestion.scan.execute` queue envelope while `idempotency-key` remains the causation ID.
- Platform metrics now has a `MetricsRecorderPort` plus in-memory adapter for MVP tests and future Prometheus/OTel adapters.
- Scan queue enqueue metrics use safe low-cardinality labels: `command_type`, `job_type` and `status`.
- Monitoring REST wires metrics into the queue adapter at the infrastructure boundary; domain entities and feature use cases remain independent from metrics implementation details.
- Ingestion worker records scan execution lifecycle metrics at the queue handler boundary with `job_type`, `status` and `worker` labels only.
- `ExecuteScanUseCase` remains free of metrics imports; future metrics backends can swap behind `MetricsRecorderPort`.
- Scan status REST response now includes support-safe `userState`, optional `failureClass` and `operatorAction` fields.
- Failure classification is implemented in the REST presentation layer, so domain status remains simple and frontend/support can still present clear next actions.
- Platform metrics now supports gauges, and scan queue enqueue records `queue_commands_backlog` with `command_type` and `queue` labels.
- Queue lag seconds remains intentionally deferred until the queue abstraction has consume/ack timestamps; recording a fake lag metric would mislead dashboards.

## Missing Evidence Blocks
- Cross-tenant access not tested.
- Secret redaction not verified.
- Support runbook absent.
- Capacity envelope or degradation drill absent.

## PR 7 Contract CI Evidence

- `7bb904a feat: add openapi drift gate`
- `7ef3cd8 feat: add migration schema gate`
- `c03ae09 feat: add event contract gate`

Verified commands:

- `npm run update:openapi`
- `npm run check:openapi`
- `npm run check:migrations`
- `npm run check:events`
- `npm run check:architecture`
- `npm run build`
- `node -e "..."` event catalog smoke verified unique event type/version keys and webhook event catalog coverage.
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint scripts/check-openapi.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint scripts/check-migrations.mjs`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint scripts/check-event-contracts.mjs libs/contracts/events/event-catalog.spec.ts`
- `git diff --check`

Evidence notes:

- `scripts/check-openapi.ts` creates a headless Nest `AppModule`, generates the Swagger/OpenAPI document and compares it with `libs/contracts/rest/openapi.snapshot.json`.
- `npm run update:openapi` is the explicit intentional-change path; `npm run check:openapi` is the CI/local drift gate.
- `npm run verify` now includes `check:openapi`, so public REST contract drift is blocked with the standard verification chain.
- The snapshot lives in `libs/contracts/rest`, keeping transport contract artifacts outside domain and feature slices.
- `scripts/check-migrations.mjs` validates the Prisma schema, regenerates the Prisma client and renders `prisma migrate diff --from-empty --to-schema prisma/schema.prisma --script`.
- The migration gate rejects an empty/no-table diff and destructive clean-bootstrap statements such as `DROP TABLE`, `DROP SCHEMA` and `TRUNCATE TABLE`.
- The migration check remains database-free for MVP CI speed; a real clean/upgrade database drill is still tracked separately for staging hardening.
- `libs/contracts/events/event-catalog.json` records internal, realtime and webhook event contracts by `eventType`, `schemaVersion`, producer and required payload fields.
- `scripts/check-event-contracts.mjs` scans production TypeScript producers for emitted `eventType`/`schemaVersion` pairs and fails if they are missing from the catalog.
- Realtime events that encode version in the event type suffix, for example `summary.status.changed.v1`, are accepted as schema version 1 while keeping the realtime protocol version separate.

## PR 8 Release Evidence Evidence

- `bf95ab3 feat: add release evidence gate`
- `38bd2fc feat: add secret scan gate`
- `7858155 fix: allow webhook key id placeholder in secret scan`
- `5aa4d04 feat: add dependency audit gate`
- `1ad1469 feat: add container release contract`

Verified commands:

- `npm run check:secrets`
- `npm run check:dependencies`
- `npm run check:container`
- `npm run check:release`
- `npm run check:architecture`
- `npm run build`
- `node --max-old-space-size=2048 ./node_modules/eslint/bin/eslint.js scripts/check-release-evidence.mjs`
- `node --max-old-space-size=2048 ./node_modules/eslint/bin/eslint.js scripts/check-secrets.mjs`
- `node --max-old-space-size=2048 ./node_modules/eslint/bin/eslint.js scripts/check-dependencies.mjs`
- `node --max-old-space-size=2048 ./node_modules/eslint/bin/eslint.js scripts/check-container.mjs`
- `git diff --check`

Evidence notes:

- `scripts/check-secrets.mjs` scans tracked source/config/docs files and ignores build/generated folders through `ops/security/secret-scan-allowlist.json`.
- Secret scanning blocks private key blocks, secret-like env assignments with non-placeholder values, bearer token literals, generated `smk_...`/`whsec_...` literals and credential URLs with non-placeholder passwords.
- Existing local/test placeholders such as `social_monitor_local_password`, `Bearer invalid`, `raw-token`, `smk_secret` and `whsec_...1234` are explicitly allowlisted instead of accepted implicitly.
- `scripts/check-dependencies.mjs` runs `npm audit --json --audit-level=high`, blocks high/critical advisories and parses npm audit JSON so the gate stays machine-verifiable.
- `ops/security/dependency-audit-policy.json` requires future vulnerability exceptions to include package name, owner, `YYYY-MM-DD` expiry and mitigation.
- `Dockerfile` defines the backend MVP container path with `npm ci`, Prisma client generation, build verification, service selection through `SERVICE` and non-root `USER node`.
- `.dockerignore` excludes `.git`, `node_modules`, `dist` and `coverage` so local/generated artifacts do not silently enter the build context.
- `scripts/check-container.mjs` validates Dockerfile markers, service start scripts, `.dockerignore`, release evidence linkage and required image digest/SBOM/signing policy.
- Docker CLI is not available in the current execution environment, so actual image build/push/sign evidence is not claimed here; it remains a CI/staging execution step.
- `ops/release/mvp-release-evidence-contract.json` defines beta release artifact evidence: commit SHA, immutable image digest, OpenAPI snapshot, event catalog and migration schema.
- `scripts/check-release-evidence.mjs` validates required blocking gates, deploy smoke checks, rollback triggers, runbook anchor and promotion document before release evidence can pass.
- `npm run verify` now includes `check:secrets`, `check:dependencies`, `check:container` and `check:release`, so supply-chain and release evidence drift are checked with the standard local/CI verification chain.
- Deploy smoke checks cover API health, OpenAPI contract, migration compatibility and worker pause/resume readiness.
- Rollback triggers cover security regressions, migration/restore regressions, provider failure spikes, summary cost spikes and delivery failure spikes.
- This is an MVP release-evidence, secret-scan, dependency-audit and container-contract gate; actual image build, SBOM generation and image signing remain explicit future supply-chain execution steps rather than silently claimed evidence.

## PR 9 Load Cost Evidence

- `46dfbf1 feat: add load cost guardrail`

Verified commands:

- `npm run check:load-cost`
- `npm run check:architecture`
- `npm run build`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint scripts/check-load-cost.mjs`
- `git diff --check`

Evidence notes:

- `scripts/check-load-cost.mjs` runs deterministic quota simulations without external providers or database services.
- Noisy scan tenant scenario verifies 50 allowed and 25 rejected manual scan reservations in the same window.
- Quiet scan tenant scenario verifies 10 allowed and 0 rejected reservations, proving tenant/workspace quota buckets isolate noisy tenants.
- Summary cost budget scenario verifies cost-like quota units allow 20 attempts and reject 5 overflow attempts before model/provider work would run.
- The gate enforces a lightweight p95 quota reservation threshold for MVP regression detection; full broker/database load tests remain a later staging drill.

## PR 10 Backup Restore Evidence

- `a896050 feat: add backup restore contract gate`
- `ab8c261 feat: add staging drill contract gate`

Verified commands:

- `npm run check:backup-restore`
- `npm run check:drills`
- `npm run check:architecture`
- `npm run build`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint scripts/check-backup-restore.mjs`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint scripts/check-drills.mjs`
- `git diff --check`

Evidence notes:

- `ops/recovery/backup-restore-contract.json` defines beta RPO/RTO, included backup tables, operational state tables and restore validation queries.
- `scripts/check-backup-restore.mjs` parses `prisma/schema.prisma` and fails if any mapped Prisma table is missing from the recovery contract.
- The contract explicitly requires replay/idempotency state: `outbox_events`, `inbox_records`, `idempotency_keys`, `scan_jobs` and `cursor_checkpoints`.
- Runbook now includes backup restore drill steps, including keeping workers paused until migration, replay and idempotency state are validated.
- This is a contract gate, not a live `pg_dump` drill; live database restore remains a staging drill before beta launch.
- `ops/drills/mvp-staging-drills.json` defines required MVP drill contracts for provider outage, provider rate-limit, DLQ growth, summary cost spike and backup restore.
- `scripts/check-drills.mjs` validates that each drill has a known verification command, support outcome, runbook section and required alert where applicable.
- Drill contracts keep staging evidence structured while preserving the current MVP boundary where live staging infrastructure is not yet attached.
