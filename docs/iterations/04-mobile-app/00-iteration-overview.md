# Iteration 04 - Mobile App Overview

## Current Status

Deferred. The current MVP is backend/API-first and does not require Flutter before beta API/operator validation.

Keep this folder as the future frontend plan. When frontend work resumes, use Flutter with Feature-Sliced Design, feature-scoped Clean Architecture, MobX presentation stores and `flutter_headless` through the design system.

## Goal

Build the Flutter MVP app with feature-scoped Clean Architecture, MobX presentation stores and strict use of the required `flutter_headless` component approach.

The app should feel like an operational monitoring tool, not a landing page.

## Frontend Architecture

Each feature slice contains:

```text
domain -> application -> ports -> adapters -> presentation -> store -> ui
```

Required feature slices:

- `auth`
- `workspace`
- `topics`
- `sources`
- `feed`
- `summaries`
- `alerts`
- `settings`

## MVP Mobile Workflow

This workflow is post-backend-MVP unless the frontend is explicitly reactivated.

The first usable app must support this exact loop:

1. open app and restore/create session
2. select workspace
3. view dashboard with topic/source/scan/summary status
4. create topic
5. bind HN/RSS source
6. configure scan interval and summary rules
7. observe scan status
8. read feed item list and item detail with provenance
9. open cited summary
10. navigate from citation to feed/source item
11. submit summary feedback
12. recover from quota/source/network/API errors through typed actions

Everything else is secondary until this loop is smooth.

## Feature Slice Baseline

Each feature exposes only a small public API:

| Feature | Public Surface | Must Hide |
| --- | --- | --- |
| `auth` | session state, login/logout/refresh use cases | secure storage implementation, raw tokens |
| `workspace` | workspace selection and context | tenant cache internals |
| `topics` | topic list/detail/create/edit use cases | REST DTOs and source adapter details |
| `sources` | catalog, binding, capability/limitation models | provider DTOs, credential secrets |
| `feed` | feed list/detail/provenance use cases | raw source payloads |
| `summaries` | summary list/detail/regenerate/feedback use cases | AI provider metadata beyond safe lineage |
| `alerts` | digest/notification settings | push provider internals |
| `settings` | preferences and diagnostics | feature private stores |

Rules:

1. Generated API DTOs stop in infrastructure mappers.
2. MobX stores expose screen state and actions, not backend DTOs.
3. Widgets import presentation view models and design system only.
4. Cross-feature navigation uses route contracts and ids, not private models.
5. Workspace switch cancels in-flight requests and blocks stale render from old workspace.

## Phase Map

1. `01-flutter-architecture-shell.md` - app shell, routing, DI, generated clients.
2. `02-design-system-headless.md` - components from `flutter_headless`.
3. `03-feature-screens.md` - topic/feed/summary/source workflows.
4. `04-offline-secure-release.md` - offline cache, secure storage, release readiness.

## Detailed Steps

1. Inspect `https://github.com/777genius/flutter_headless` patterns and lock component usage.
2. Create feature folder structure.
3. Add generated OpenAPI REST client.
4. Add WebSocket client port.
5. Add MobX stores per feature.
6. Add Result/Error mapping from API to presentation states.
7. Build auth/session flow.
8. Build topic list/detail/create screens.
9. Build source binding screen with source limitations.
10. Build feed timeline with filters and item detail.
11. Build summary list/detail/regenerate workflow.
12. Build scan status/realtime updates.
13. Build alert/digest settings.
14. Add offline cache for read models.
15. Add golden/widget/integration tests for core workflows.

## Edge Cases

- Backend returns source capability unavailable.
- Summary is still running.
- Scan failed due to quota.
- User loses network during topic creation.
- WebSocket disconnects but REST still works.
- Generated API client schema mismatches backend.
- Tenant has no sources enabled.
- Summary text/citations are too long for mobile.
- User changes workspace while requests are in flight.
- OpenAPI enum adds new value before app update.
- Realtime event arrives before REST read model refresh.
- Cached summary belongs to old workspace after switch.
- Source limitation text is longer than compact mobile layout.
- User taps regenerate repeatedly while summary job is already running.

## UI Rules

- No marketing hero screen.
- First screen after login is operational dashboard/inbox.
- Source risk/limitations are visible in setup.
- Empty states are actionable.
- Mobile layout must support dense scanning and quick triage.
- Do not use nested cards or decorative visual noise.
- Use stable dimensions for status badges, toolbar actions, filters and counters.
- Long text must wrap or clamp intentionally; no overflow is acceptable.
- First screen must be an operational dashboard, not a marketing or onboarding hero.

## Quality Gates

- Feature slices do not import unrelated feature internals.
- MobX stores are presentation-only and call use cases/ports.
- OpenAPI client is generated, not manually duplicated.
- Core screens have loading/error/empty/success states.
- Golden tests cover key responsive layouts.
- No text overflows on small screens.
- Store tests cover workspace switch, request cancellation and unknown backend enum.
- Citation navigation works from summary claim to source item/provenance.

## Done Criteria

Iteration 04 is complete when a user can log in, create a topic, bind supported sources, inspect feed items, view summaries and see scan status from the mobile app.
