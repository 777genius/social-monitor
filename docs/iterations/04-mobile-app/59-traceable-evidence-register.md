# Iteration 04 - Traceable Evidence Register

## Evidence Goal
Prove that the Flutter app completes the MVP loop through feature-scoped architecture.

## Critical Audit Evidence
- Generated DTOs stop in infrastructure mappers.
- MobX stores expose typed states and recovery actions, not raw API responses.
- Workspace switch/request cancellation prevents stale cross-workspace rendering.
- Citation navigation, stale/offline states and unknown enum fallback are tested.
- Mobile complexity guardrails are proven: limited global state, no business rules in stores/widgets and no unsupported offline writes.

## Decision Evidence
- Feature-scoped architecture decision.
- Generated client wrapper decision.
- DTO/domain mapping rule.
- MobX store responsibility rule.
- UI state coverage rule.

## Ticket Evidence
- Feature tickets link to mapper and store tests.
- UI tickets link to loading/empty/error/stale/offline evidence.
- Summary UI tickets link to citation drill-down scenario.
- Contract tickets link to generated client diff.

## Review Evidence
- Flutter PR rubric completed.
- Backend/API owner approves contract usage.
- Realtime lead accepts store integration path.

## Handoff Evidence
- Realtime iteration accepts mobile state boundaries.
- Support receives user-visible error state notes.

## Missing Evidence Blocks
- DTO used as domain evidence.
- Missing store tests.
- Missing core loop walkthrough.
- Global store owns feature data or offline writes lack conflict/idempotency evidence.
