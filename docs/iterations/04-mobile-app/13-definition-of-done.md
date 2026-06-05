# Iteration 04 - Definition Of Done

## Done Checklist

1. Flutter app shell runs.
2. Feature-scoped folders exist.
3. Generated REST client is wrapped.
4. MobX stores are presentation-scoped.
5. Topic flow works.
6. Source binding flow works.
7. Feed flow works.
8. Summary/citation flow works.
9. Feedback flow works.
10. Loading/empty/error/stale/offline states exist.
11. Headless components are used.
12. Full mobile MVP loop works.

## Architecture Done

- Generated DTOs do not become domain models.
- Widgets do not own domain invariants.
- Feature infrastructure does not leak across features.
- Stores orchestrate use cases only.

## Evidence Required

- Store test output.
- DTO mapping test output.
- Full-flow test/smoke notes.
- Screens for failure states.
- OpenAPI client regeneration result.

## Not Done If

- User cannot understand source/scan/summary failure.
- App needs developer help to complete MVP loop.
- Feature imports another feature infrastructure directly.
- Offline/stale state is hidden.
