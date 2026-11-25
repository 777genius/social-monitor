# Iteration 04 - Iteration Acceptance Contract

## Provider
Mobile team provides feature-scoped app flow, domain-safe state and core UI scenarios.

## Receiver
Iteration 05 realtime team receives store and UI-state contracts for live updates.

## Handoff Promises
- Core loop works: topic -> source -> feed -> summary -> citation.
- DTOs are isolated in infrastructure.
- MobX stores orchestrate presentation state only.
- Loading, empty, error, stale and offline states are covered.
- Citation drill-down handles missing targets.

## Receiver Expectations
- Realtime can update feature stores without direct widget mutation.
- Event updates can map to existing UI states.
- Mobile can recover from stale or missed state.

## Blocking Defects
- DTO/domain boundary violation.
- Core loop incomplete.
- Hidden failure states.
- Store owns business rules.

## Allowed Exceptions
- Advanced polish can wait.
- Deep offline-first behavior can wait.
