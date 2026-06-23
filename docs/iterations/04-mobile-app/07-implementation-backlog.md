# Iteration 04 - Implementation Backlog

## Purpose

Build the Flutter MVP as a real operational app: feature-scoped Clean Architecture, MobX stores, generated REST clients and headless components.

## App Shell Backlog

1. Create app entrypoint and environment config.
2. Add navigation shell.
3. Add authentication/session boundary.
4. Add generated OpenAPI client.
5. Add DI/composition root.
6. Add error boundary and offline banner.

## Feature Backlog

1. Topic feature:
   - create topic
   - edit keywords/rules
   - view topic status
2. Source binding feature:
   - list available sources
   - configure source query
   - configure interval
   - pause/resume binding
3. Feed feature:
   - list normalized items
   - filter by source/date/status
   - open item details
   - show source provenance
4. Summary feature:
   - configure summary policy
   - view latest summary
   - view cited items
   - submit feedback
5. Settings feature:
   - workspace settings
   - notification settings
   - API key/webhook placeholders

## Architecture Backlog

1. Use feature packages as bounded contexts with full tactical DDD folders.
2. Keep MobX stores in presentation layer.
3. Keep API DTO mapping inside infrastructure.
4. Keep domain entities independent from Flutter widgets.
5. Use headless components from `flutter_headless` as required.
6. Add domain/application contracts for generated client wrappers.

## UX Edge Cases

- Scan is running while user edits interval.
- Source binding fails because provider quota is exhausted.
- Feed is empty but scan has not run yet.
- Summary exists but some source items are unavailable.
- Mobile app resumes from stale state.
- User has no workspace or workspace was disabled.
- Backend returns schema-compatible but semantically invalid error state.

## Validation

- App can complete full MVP loop from topic creation to viewing summary.
- Stores are testable without widgets.
- UI shows loading, empty, error, stale and partial-success states.
- No feature imports another feature's infrastructure directly.
