# Iteration 04 - Sprint Review Demo Script

## Review Goal
Prove that the Flutter app executes the MVP loop through feature-scoped Clean Architecture and clear user states.

## Demo Flow
1. Open app shell and navigate core features.
2. Create a topic.
3. Bind a source.
4. View feed data.
5. View summary and citation drill-down.
6. Demonstrate loading, empty, error, stale and offline states.

## Evidence To Show
- Generated DTOs are isolated in infrastructure.
- Feature slices contain domain, application, adapters and MobX stores.
- MobX stores orchestrate presentation only.
- Headless components are used where required.

## Edge Cases To Exercise
- API returns validation error.
- Feed is empty after scan.
- Summary citation target is missing.
- User changes topic while data is loading.

## Review Questions
- Can a beta user complete the core loop without manual help?
- Are backend failures visible and understandable?
- Are feature boundaries ready for more sources later?

## Accept Progress If
- Core loop works in UI.
- Failure states are covered.
- Domain/DTO boundary is preserved.
