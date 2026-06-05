# Iteration 04 - Team Ownership And Communication

## Communication Goal
Keep Flutter feature work aligned with generated contracts, feature-scoped architecture and core MVP UX.

## Decision Owners
- Flutter lead: feature boundaries and stores.
- API owner: generated client contract.
- Product owner: user-facing states.
- QA owner: UI/store scenario coverage.

## Reviewers
- Backend lead reviews contract usage.
- Design/system owner reviews component usage.
- Realtime lead reviews future live-update readiness.

## Sync Points
- Kickoff: confirm feature slices and contract inputs.
- Midpoint: review core loop and failure states.
- Closeout: confirm realtime integration readiness.

## Escalate When
- DTOs leak into domain.
- A store starts owning business logic.
- Backend contract changes break mobile.
- Failure state is not user-visible.

## Handoff Message
Mobile is ready when realtime can update feature stores without bypassing Clean Architecture or domain-safe models.
