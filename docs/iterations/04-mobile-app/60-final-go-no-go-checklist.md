# Iteration 04 - Final Go/No-Go Checklist

## Decision Scope
Decide whether mobile MVP is ready for realtime integration.

## Go Conditions
- Core loop works in Flutter.
- Generated DTOs stay in infrastructure.
- MobX stores do not own business rules.
- Loading, empty, error, stale and offline states are covered.
- Citation drill-down works or fails clearly.

## Hold Conditions
- Visual polish is incomplete.
- Deep offline-first behavior is deferred.

## Rework Conditions
- DTOs are used as domain models.
- Core loop requires manual workaround.
- Failure states are hidden.
- Realtime would need direct widget mutation.

## Accepted Exceptions
- Non-critical settings can wait.
- Secondary analytics screens can wait.

## Critical Audit Evidence
- Generated DTO boundary, store state transitions and workspace-switch cancellation tests pass.
- Core screens expose recovery actions for source, scan, feed, summary, auth and offline failures.
- Citation navigation and stale/offline behavior are tested.
- Global state, store responsibilities, design-system wrapping and offline write policy match MVP complexity guardrails.

## Decision Record
Record decision as `go`, `hold` or `rework` with app walkthrough, mapper, store and UI-state evidence.
