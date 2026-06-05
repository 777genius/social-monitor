# Iteration 04 - Risk Burndown And Control Points

## Burndown Goal
Reduce mobile architecture and UX-state risk before realtime integration.

## Day 1 Control Point
- Feature-slice structure is agreed.
- Generated client wrapper approach is defined.
- DTO/domain mapping rule is accepted.

## Midpoint Control Point
- Topic and source-binding flows use feature boundaries.
- Store tests cover success and failure states.
- Core API contract mismatches are resolved.

## Closeout Control Point
- Core loop works in UI.
- Loading, empty, error, stale and offline states are covered.
- Realtime can update stores without direct widget mutation.

## Escalation Threshold
Escalate if generated DTOs or clients leak into domain/presentation logic.

## Residual Risk Rule
Polish can carry forward; core loop and feature-boundary risks may not.
