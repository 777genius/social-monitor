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

Verified commands:

- `npm run check:architecture`
- `npm run build`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest libs/usage/features/record-public-api-audit-event/record-public-api-audit-event.use-case.spec.ts --runInBand`
- `NODE_OPTIONS=--max-old-space-size=2048 npx jest --config test/jest-e2e.config.ts --runInBand test/e2e/webhook-endpoints.audit.e2e-spec.ts`
- `NODE_OPTIONS=--max-old-space-size=2048 npx eslint ...`
- `git diff --check`

Evidence notes:

- Public API audit records now carry `outcome` and optional `reasonCode`.
- Audit metadata is redacted in the use case before append, not only at the logging layer.
- Webhook endpoint management audit e2e verifies successful audit outcome and no raw API key/signing secret leakage.

## Review Evidence
- Cross-functional hardening review is approved.
- Support owner confirms runbooks.
- SRE owner confirms dashboard and alert coverage.

## Handoff Evidence
- Launch iteration accepts go/no-go evidence.
- Residual risks have owner and rollback trigger.

## Missing Evidence Blocks
- Cross-tenant access not tested.
- Secret redaction not verified.
- Support runbook absent.
- Capacity envelope or degradation drill absent.
