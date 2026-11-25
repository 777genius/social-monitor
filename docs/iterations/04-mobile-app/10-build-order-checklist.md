# Iteration 04 - Build Order Checklist

## Build Order

1. Scaffold Flutter app shell.
2. Create feature folders.
3. Add generated REST client setup.
4. Add API adapter wrappers.
5. Add DI/composition root.
6. Add MobX store conventions.
7. Integrate required headless components.
8. Build topic feature.
9. Build source binding feature.
10. Build feed feature.
11. Build summary feature.
12. Add citation navigation.
13. Add feedback UI.
14. Add loading/empty/error/stale states.
15. Add offline/resume behavior.
16. Add feature tests.

## First PR Sequence

1. PR 1: app shell, routing, session placeholder and composition root.
2. PR 2: generated API client, DTO mappers and Problem Details recovery mapping.
3. PR 3: `design_system` wrappers around approved `flutter_headless` primitives.
4. PR 4: workspace/dashboard/topic stores with fake repositories.
5. PR 5: topic create/detail and source catalog/binding screens.
6. PR 6: feed list/detail/provenance with pagination and stale state.
7. PR 7: summary list/detail/citation navigation and feedback.
8. PR 8: WebSocket status hint adapter with REST resync.
9. PR 9: offline read cache, secure storage and tenant namespace.
10. PR 10: integration test for core mobile loop and release checks.

## Contracts First

- Generated OpenAPI client.
- Feature repository ports.
- Error state mapping.
- View model shapes.
- Navigation contracts.
- Store state machine contract.
- Cache namespace/version contract.
- Design system component contract.

## Tests And Checks

- Store tests without widgets.
- DTO mapping tests.
- Feature boundary checks.
- Offline/resume scenario.
- Full MVP mobile flow.
- Unknown enum/status mapper tests.
- Workspace switch late-response tests.
- Citation navigation tests.
- Direct `flutter_headless` import check outside design system.
- Text overflow/golden tests for small screens.

## Edge Cases Before Closure

- First scan not complete.
- Source binding paused.
- Summary failed but feed healthy.
- Citation item unavailable.
- Token expires offline.
- Workspace changes while deep route is open.
- Realtime event arrives during manual refresh.
- Source is readiness-only and cannot be bound.
- Summary is superseded while detail screen is open.

## Closure

Close only when the app completes topic -> source binding -> feed -> cited summary.
