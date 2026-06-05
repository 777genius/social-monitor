# Iteration 01 - PR Review Rubric

## Review Goal
Ensure platform PRs preserve Clean Architecture while creating a usable NestJS baseline.

## Architecture Checks
- Domain has no NestJS, ORM, broker or DTO imports.
- Use cases depend on ports.
- Controllers translate, not decide.
- Shared libraries have narrow ownership.

## Test And Evidence Checks
- Build, lint and tests pass.
- Import-boundary checks pass.
- Migrations run clean and upgraded paths.
- OpenAPI is generated.
- Outbox/idempotency behavior is tested.

## Edge Case Checks
- Duplicate command behavior is safe.
- Crash after write before publish is recoverable.
- Missing tenant context is rejected.

## Merge Blockers
- Domain boundary violation.
- Manual OpenAPI patch.
- Migration path unreliable.
- Missing idempotency for write command.
