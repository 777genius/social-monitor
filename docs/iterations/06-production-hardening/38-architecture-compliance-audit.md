# Iteration 06 - Architecture Compliance Audit

## Audit Goal
Verify that beta hardening enforces architecture, security, operations and cost controls rather than documenting them only.

## Required Checks
- Tenant isolation tests cover REST, workers, events, read models and realtime.
- Secrets are encrypted and redacted in logs/traces/errors.
- CI blocks breaking OpenAPI, event schema and migration changes.
- Observability covers user-visible outcomes, not only infrastructure health.
- Quotas protect scan and summary cost.

## Critical Violations
- Cross-tenant data can be accessed through any path.
- Provider credentials can appear in logs or traces.
- Contract-breaking change passes CI silently.
- Support cannot diagnose common beta failures without shell access.

## SOLID And Clean Architecture Focus
- Operational adapters must not introduce domain shortcuts.
- Policy and quota enforcement must live in application/domain paths, not only middleware.
- Infrastructure checks must protect architectural boundaries automatically.

## Evidence Required
- Tenant isolation report. REST evidence currently includes commits `739d203`, `dd8e814`, `55f6154`, `ee8a44e`, `fa53fa7`, `86c4958`.
- Redaction test result.
- CI gate examples.
- Dashboard links or screenshots.
- Backup/restore verification.

## Closure Rule
Iteration 07 cannot start if any critical beta safety gate is unresolved.

## Current Audit Notes

- REST adapters now validate tenant/workspace scope with shared-kernel `requireTenantScope` instead of directly coercing headers.
- Domain/features remain isolated from HTTP headers; the guard is placed at the interface adapter boundary.
- Architecture check confirms boundary rules after the REST hardening slice.
- Remaining PR1 audit surface is worker/event tenant context assertions beyond REST, if the next scan finds missing coverage.
