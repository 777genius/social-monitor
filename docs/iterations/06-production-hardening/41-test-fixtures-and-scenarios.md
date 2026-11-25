# Iteration 06 - Test Fixtures And Scenarios

## Purpose
Define hardening fixtures that prove beta safety across tenants, secrets, contracts, quotas and recovery.

## Core Fixtures
- Two tenants with overlapping topic names and source bindings.
- Provider credential sample.
- Redacted log and trace samples.
- Breaking and non-breaking OpenAPI/event/migration changes.
- Quota thresholds and exhausted quota state.
- Deploy/migration while workers have queued jobs.
- Membership revocation while WS/job/support access is active.
- Topic/source deletion while scan, summary and delivery work is queued.

## Happy Path Scenarios
- Tenant can access only its own data.
- Secret is encrypted and redacted.
- CI accepts compatible contract change.
- Quota state is visible to user and operator.
- Worker drain/pause during deploy preserves idempotency and visibility.

## Negative Scenarios
- Cross-tenant read attempt.
- Provider error includes credential-like content.
- CI receives breaking contract change.
- Backup restore fails validation.
- Worker processes job after tenant/membership/source state was revoked.
- Migration changes schema while old worker writes incompatible row.

## Edge Cases
- Worker path bypasses REST checks.
- Metrics contain tenant-sensitive labels.
- Cost spike from valid but excessive schedule.
- Migration is valid but breaks generated client expectation.
- Event replay reprocesses data with stale authorization assumptions.
- Support view sees stale access after membership revoke.

## Regression Seeds
- Tenant isolation negative test pack.
- Redaction examples.
- CI gate fixtures.
- Quota exhaustion scenario.
- Deploy/migration drain fixture.
- Stale authorization replay fixture.
