# 177. Flutter Testing and Release Gates

## Status

Locked for Flutter quality baseline.

## Research Anchors

- Flutter widget testing: https://docs.flutter.dev/cookbook/testing/widget/introduction
- Flutter integration testing: https://docs.flutter.dev/testing/integration-tests
- Flutter performance profiling: https://docs.flutter.dev/perf/ui-performance
- Frontend testing strategy: `../../apps/frontend/docs/frontend-testing-strategy.md`

## Decision

Flutter quality gates must cover architecture boundaries, generated clients, state stores, visual regressions and critical journeys.

## Test Layers

| Layer | Purpose |
|---|---|
| unit | domain models, use cases, mappers |
| store tests | MobX presentation state and reactions |
| widget tests | feature UI behavior with fake stores/adapters |
| golden tests | design-system and critical responsive layouts |
| integration tests | login, onboarding, topic/source setup, feed, digest |
| performance tests | feed scrolling, summary screen, startup time |

## Release Gates

Before mobile release:

- `flutter analyze`;
- unit/widget tests;
- MobX/build_runner generated files fresh;
- generated OpenAPI client fresh;
- design-system import boundary check;
- selected golden tests on stable CI environment;
- smoke integration run for critical workflows;
- privacy disclosure diff reviewed if data collection changed.

## Best-Fact Choice

For this app, store/use-case tests and generated-client freshness are more important than trying to cover every screen with slow integration tests.
