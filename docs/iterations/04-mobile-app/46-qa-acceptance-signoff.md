# Iteration 04 - QA Acceptance Signoff

## Signoff Goal
Confirm that the Flutter app completes the core loop without violating feature-scoped architecture.

## Acceptance Scenarios
- User creates topic.
- User binds supported source.
- User sees feed after scan.
- User opens summary and citations.
- Loading, empty, error, stale and offline states render.

## Negative Cases
- API validation error.
- Unsupported source binding.
- Empty feed after scan.
- Missing citation target.
- Network failure.

## Regression Coverage
- DTO-to-domain mapper tests.
- MobX store state tests.
- UI state scenarios.
- Generated client compatibility check.

## Residual Risks
- Advanced visual polish can be deferred.
- Deep offline-first behavior can be phased later.

## Approvers
- Flutter lead.
- API owner.
- Product owner.
- QA owner.
