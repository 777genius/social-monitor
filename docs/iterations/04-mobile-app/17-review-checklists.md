# Iteration 04 - Review Checklists

## Flutter Architecture Review

1. Feature folders keep domain, application, infrastructure and presentation separated.
2. Generated DTOs do not become domain models.
3. MobX stores stay in presentation and orchestrate use cases only.
4. Feature infrastructure is not imported directly by other features.

## UI State Review

1. Loading state exists.
2. Empty state exists.
3. Error state exists.
4. Stale/offline state exists.
5. Source limitation state is visible.

## Flow Review

1. Topic flow works.
2. Source binding flow works.
3. Feed flow works.
4. Summary/citation flow works.
5. Full MVP loop works without developer help.
