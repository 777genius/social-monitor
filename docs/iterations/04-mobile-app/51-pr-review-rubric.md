# Iteration 04 - PR Review Rubric

## Review Goal
Ensure Flutter PRs preserve feature-scoped Clean Architecture and complete user-visible states.

## Architecture Checks
- DTOs stay in infrastructure.
- Use cases depend on feature ports/repositories.
- MobX stores orchestrate presentation only.
- Widgets do not own business rules.

## Test And Evidence Checks
- Flutter analyze passes.
- Mapper tests pass.
- Store tests pass.
- UI states are covered: loading, empty, error, stale and offline.

## Edge Case Checks
- API validation error.
- Missing citation target.
- Topic switch during request.
- Stale cache after offline mode.

## Merge Blockers
- DTO used as domain model.
- Store calls generated client directly.
- Failure state hidden.
- Core loop broken.
