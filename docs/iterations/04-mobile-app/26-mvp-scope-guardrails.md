# Iteration 04 - MVP Scope Guardrails

## In Scope

1. Flutter app shell.
2. Feature-scoped architecture.
3. Topic/source/feed/summary flows.
4. MobX presentation stores.
5. Generated REST client boundary.
6. Loading/empty/error/stale/offline states.

## Out Of Scope

1. Marketing landing page.
2. Decorative UI polish before core flow.
3. Unsupported source setup screens.
4. Complex analytics UI.

## Scope Creep Signals

- UI polish delays full MVP loop.
- Screen exists without backend state mapping.
- Feature uses generated DTOs as domain models to move faster.

## Decision Rule

Accept mobile work only if it helps users configure monitoring, inspect feed, understand summaries or diagnose failures.

## Complexity Budget

- Build deeply: app shell, feature slices, generated client adapters, topic/source/feed/summary flows, MobX stores and failure states.
- Define lightly: realtime adapter boundary, notification extension points and future analytics surface.
- Defer: marketing screens, rich dashboards, advanced personalization UI and polish that does not improve the core loop.
