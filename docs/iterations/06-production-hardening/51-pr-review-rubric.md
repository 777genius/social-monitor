# Iteration 06 - PR Review Rubric

## Review Goal
Ensure hardening PRs enforce beta safety through tests, gates and operational evidence.

## Architecture Checks
- Tenant isolation applies across API, workers, events and realtime.
- Secret handling is enforced at boundaries.
- Quotas are enforced in application/domain paths.
- CI protects public contracts.
- Feature use cases depend on ports, not concrete adapters.
- Feature use cases return `Result` failures instead of throwing `DomainError`.
- REST controllers establish tenant/workspace scope before use-case calls.

## Test And Evidence Checks
- Tenant isolation suite passes.
- Redaction tests pass.
- CI gate evidence is attached.
- Dashboard/metric evidence exists.
- Backup/restore verification is recorded.
- Every production feature use case has a focused sibling `*.use-case.spec.ts`.
- Feature use-case specs reference the actual exported use case and are not empty formal files.
- No committed test uses `.only` or `.skip`.
- `npm run check:code-quality` passes and is included in release evidence.
- `npm run check:release` proves every blocking release gate is included in `npm run verify`.

## Edge Case Checks
- Worker bypasses REST auth.
- Provider error contains sensitive data.
- Breaking contract passes local tests.
- Cost spike from valid config.
- Public catalog endpoint accidentally becomes tenant data endpoint.
- New use case handles validation/not-found/idempotency edge cases only through controller tests.

## Merge Blockers
- Cross-tenant access reproducible.
- Secret appears in logs/traces/errors.
- Breaking contract passes CI.
- Support cannot diagnose common failure.
- Missing use-case spec for new feature code.
- `console.*` added to production `apps` or `libs` code.
