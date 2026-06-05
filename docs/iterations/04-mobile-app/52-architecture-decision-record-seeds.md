# Iteration 04 - Architecture Decision Record Seeds

## Purpose
List mobile architecture decisions that must be stable before realtime and beta work.

## ADR Seeds
- Use feature-scoped Clean Architecture.
- Keep generated DTOs inside infrastructure adapters.
- Use MobX stores for presentation orchestration only.
- Use generated REST client from OpenAPI.
- Require loading, empty, error, stale and offline states.

## Alternatives To Capture
- Layer-by-type mobile structure vs feature-scoped structure.
- DTOs as domain models vs explicit mapping.
- Stores with business logic vs use-case-centered logic.

## Consequences To Record
- Feature-scoped structure supports source/summary growth.
- Mapping adds code but protects domain semantics.
- Explicit UI states improve beta support and trust.

## Revisit Triggers
- Feature slices duplicate too much infrastructure.
- Generated client changes become too noisy.
- Realtime integration pressures store boundaries.
