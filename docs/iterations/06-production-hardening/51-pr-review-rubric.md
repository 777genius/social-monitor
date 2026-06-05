# Iteration 06 - PR Review Rubric

## Review Goal
Ensure hardening PRs enforce beta safety through tests, gates and operational evidence.

## Architecture Checks
- Tenant isolation applies across API, workers, events and realtime.
- Secret handling is enforced at boundaries.
- Quotas are enforced in application/domain paths.
- CI protects public contracts.

## Test And Evidence Checks
- Tenant isolation suite passes.
- Redaction tests pass.
- CI gate evidence is attached.
- Dashboard/metric evidence exists.
- Backup/restore verification is recorded.

## Edge Case Checks
- Worker bypasses REST auth.
- Provider error contains sensitive data.
- Breaking contract passes local tests.
- Cost spike from valid config.

## Merge Blockers
- Cross-tenant access reproducible.
- Secret appears in logs/traces/errors.
- Breaking contract passes CI.
- Support cannot diagnose common failure.
