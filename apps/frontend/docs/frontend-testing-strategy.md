# Frontend Testing Strategy

## Purpose

This strategy defines which frontend risks are proven by which tests.
It supplements the architecture boundary test and keeps feature tests split as code grows.

Research anchors:

- Flutter widget testing: https://docs.flutter.dev/cookbook/testing/widget/introduction
- Flutter integration testing: https://docs.flutter.dev/testing/integration-tests
- Flutter performance best practices: https://docs.flutter.dev/perf/best-practices
- Project release gates: `../../../docs/architecture-memory/177-flutter-testing-release-gates.md`

## Test Pyramid

Unit tests:

- value objects;
- policies/specifications;
- use cases with fake contracts;
- mappers;
- cache/realtime ordering primitives.

Store tests:

- async state transitions;
- stale result rejection;
- permission/repair states;
- action intent state;
- polling/realtime merge behavior.

Widget tests:

- feature page loading/empty/error/ready states;
- form validation and disabled actions;
- responsive component behavior;
- semantics for new shared components.

Route tests:

- app shell route registry;
- deep links and query params;
- auth/workspace redirects;
- browser/mobile back behavior.

Golden tests:

- design-system primitives;
- dense operational layouts that are stable enough for visual regression;
- not every feature screen by default.

Integration tests:

- sign-in/bootstrap;
- interest creation;
- source connection repair;
- feed triage;
- summary review.

Performance tests:

- feed scroll;
- large source list;
- summary detail with citations;
- app startup once features become real.

## What Not To Test

Do not write:

- one mega-widget test for an entire feature;
- tests with raw provider payload dumps;
- tests that assert exact localized copy in domain/application layers;
- tests that depend on real user projects or real provider credentials.

## File Layout

Preferred:

```text
test/
  domain/
  application/
  infrastructure/
    mappers/
  presentation/
    stores/
    widgets/
    routes/
  support/
```

Root-level feature mega-tests are forbidden except `architecture_boundaries_test.dart`.

## Responsive Test Matrix

Every shared design-system layout primitive needs widget tests for:

- compact width;
- medium width when behavior differs;
- expanded width;
- text scale smoke when labels can wrap;
- keyboard/focus behavior for interactive controls.

Feature pages need responsive tests when they introduce:

- split view;
- filters;
- dense lists/tables;
- detail panels;
- form flows.

## Critical Workflow Definition

A workflow is critical when failure blocks:

- sign-in or workspace bootstrap;
- source connection or credential repair;
- interest setup;
- feed review;
- summary generation/review;
- privacy/security preference changes.

Critical workflows require store tests and at least one route/widget or integration-level proof.

## Done Checklist

For every non-trivial feature change:

- unit tests for new value object/use case/mapper;
- store test for async/stale/permission behavior;
- widget test for primary UI state;
- route/deep-link test when route contract changes;
- architecture boundary test stays green;
- frontend analyze stays green.

