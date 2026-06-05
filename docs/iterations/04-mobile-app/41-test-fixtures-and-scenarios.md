# Iteration 04 - Test Fixtures And Scenarios

## Purpose
Define mobile fixtures that prove feature-scoped architecture and user-visible states.

## Core Fixtures
- Generated OpenAPI DTO samples.
- Domain topic, source binding, feed item and summary models.
- API success, validation error, provider error and network error responses.
- Summary with valid, missing and stale citations.
- Offline cache and stale-data state.
- Unknown enum/status API response.
- Readiness-only source catalog item.
- Long source names, limitation labels and citation titles.
- Superseded summary and unavailable citation target.
- Workspace switch with late API response.

## Happy Path Scenarios
- User creates topic.
- User binds supported source.
- User sees feed after scan.
- User opens summary and citation detail.
- User submits summary feedback.
- WebSocket status hint triggers REST refresh and screen update.

## Negative Scenarios
- API returns validation error.
- Source binding is unsupported.
- Feed is empty after successful scan.
- Summary citation target is missing.
- Auth expires during refresh.
- Generated DTO maps unknown enum value.
- Direct generated DTO reaches store/domain in architecture test.
- Direct `flutter_headless` import appears in feature code.

## Edge Cases
- User changes topic while request is in flight.
- Generated DTO adds optional field.
- Offline state conflicts with stale cache.
- Store receives update after widget disposal.
- Workspace changes while deep summary route is open.
- User taps regenerate twice.
- Cached data belongs to previous workspace.
- Text scale causes dense status row to wrap.

## Regression Seeds
- DTO-to-domain mapper fixtures.
- MobX store state transition cases.
- UI state screenshots or golden baselines.
- Problem Details recovery action fixture pack.
- Cache namespace/isolation fixture pack.
- Citation navigation fixture pack.
