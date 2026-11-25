# Iteration 04 - Retrospective Improvement Log

## Retrospective Goal
Capture whether Flutter feature slices deliver the MVP loop without violating Clean Architecture or hiding failures.

## What Worked
- Feature-scoped structure kept domain/application/adapters close to the feature.
- Generated clients reduced manual contract mistakes.
- MobX stores made presentation state explicit.

## What To Improve
- Add tests for stores that handle mixed loading/error/realtime state.
- Improve DTO-to-domain mapper coverage.
- Document any headless component usage gaps.

## Architecture Lessons
- Mobile DTOs must remain infrastructure details.
- Stores should orchestrate state, not own business rules.
- Failure and stale states are part of MVP usability.

## Edge Cases Found
- API contract changes break generated client assumptions.
- Summary citation target is missing.
- User switches topic while scan/feed requests are still resolving.
- Offline state conflicts with stale cached data.

## Carryover To Next Iteration
- Realtime integration must preserve feature boundaries.
- Resync handling should update stores without duplicating business logic.
- Any confusing failure state must be fixed before beta hardening.
