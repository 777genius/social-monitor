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

## PR 5 Observability Contract Evidence

- `2e14638 feat: normalize request context headers`
- `f622ed4 feat: normalize safe observability labels`

Verified commands:

- `npm run build`
- `npm run check:architecture`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/platform/request-context/src/request-context.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/platform/logging/src/safe-label.spec.ts libs/platform/logging/src/structured-logger.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/api-gateway.health.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint ...`
- `git diff --check`

Evidence notes:

- Request context IDs are bounded to 128 characters and limited to safe label characters.
- Unsafe request/correlation/causation headers are dropped rather than propagated to logs, traces or response headers.
- Health e2e verifies explicit safe IDs propagate and unsafe IDs fall back to generated request/correlation IDs.
- Logging safe-label helper preserves low-cardinality provider/status/job labels and maps emails, URLs, free-form prompt text and oversized strings to `unknown`.
- Structured logger applies secret redaction before safe-label normalization so generated API keys and bearer values remain `[REDACTED]`.

## Missing Evidence Blocks
- Cross-tenant access not tested.
- Secret redaction not verified.
- Support runbook absent.
- Capacity envelope or degradation drill absent.
