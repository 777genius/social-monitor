# Iteration 04 - Anti-Patterns And Forbidden Shortcuts

## Purpose
Prevent Flutter MVP from becoming DTO-driven UI without domain boundaries.

## Forbidden Shortcuts
- Using generated DTOs as domain models.
- Calling generated clients directly from widgets or stores.
- Putting business rules in MobX stores.
- Skipping failure states because the happy path works.

## Architecture Anti-Patterns
- Feature folders split by technical type only.
- Duplicate mapping logic across features.
- Realtime state planned as direct widget mutation.

## Product Anti-Patterns
- Polishing secondary screens before core loop works.
- Hiding stale/offline state.
- Showing summaries without citation drill-down.

## Stop Immediately If
- Core loop cannot be completed.
- User cannot understand source or summary failure.
- Feature boundary is bypassed for speed.
