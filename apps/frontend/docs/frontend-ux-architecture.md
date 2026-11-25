# Frontend UX Architecture And Information Architecture

## Purpose

This document defines how users move through the Social Monitor frontend before feature code grows.
It is about product workflow, navigation ownership and responsive behavior, not visual polish.

Research anchors:

- Flutter adaptive and responsive design: https://docs.flutter.dev/ui/adaptive-responsive
- Flutter adaptive best practices: https://docs.flutter.dev/ui/adaptive-responsive/best-practices
- Flutter general adaptive approach: https://docs.flutter.dev/ui/adaptive-responsive/general
- Project navigation memory: `../../../docs/architecture-memory/184-flutter-navigation-deep-links.md`

## Product IA

The first app shell is operational, not marketing-style.

Primary areas:

- `overview` - workspace health, recent activity and setup gaps.
- `auth` - sign-in, session restore and workspace bootstrap.
- `topics` - monitoring intents, rules, keywords and topic lifecycle.
- `sources` - source catalog, credentials health and collection health.
- `feed` - mentions, filtering, triage, provenance and evidence preview.
- `summaries` - workspace summaries, citations, regeneration and feedback.
- `settings` - workspace governance, account controls and diagnostics.

Every route must answer:

- Which workspace is active?
- Which entity or workflow is selected?
- What state blocks progress?
- What repair action exists?
- What happens on compact, medium and expanded layouts?

## App Shell

The app shell owns:

- `MaterialApp.router` and `GoRouter`;
- typed `FeatureRouteContract` registry;
- unknown route behavior;
- auth/session redirect behavior;
- workspace selection and workspace-missing behavior;
- pending safe intent resume after sign-in;
- top-level navigation destinations;
- route observers and screen-level telemetry context.

Features own:

- route entrypoint widget;
- feature module scope;
- screen composition;
- workflow state;
- feature-local components and stores.

Features must not own raw route path strings, auth redirects, workspace bootstrapping or deep-link parsing policy.

## Responsive Navigation

Compact:

- bottom or drawer navigation from shared design-system shell;
- single-column task flow;
- details open as pushed pages or full-height panels;
- destructive or credential repair flows use explicit confirmation surfaces;
- back returns to the previous workflow state, not a random root page.

Medium:

- navigation rail or constrained side navigation;
- list/detail may use stacked navigation or two-pane layout depending on density;
- filters are collapsible but always discoverable.

Expanded:

- persistent navigation;
- split list/detail layout for feed, sources and summaries;
- setup or permission repair panels can sit beside the main list;
- content width is constrained for forms and reading surfaces.

Do not use device-type guesses. Use design-system breakpoints, constraints and `AppScreenClass`.

## Workspace Switcher

Workspace switcher requirements:

- visible in the shell once authenticated;
- current tenant/workspace identity is clear without exposing sensitive names in logs;
- switching workspace invalidates stores, cache entries, selection, route-scoped data and realtime guards;
- if a deep link requires a workspace and none is active, route to workspace selection;
- if a selected workspace lacks permission, show permission repair state instead of stale data.

No feature may keep displaying previous workspace data after a switch.

## Route Hierarchy

Canonical first-level routes:

```text
/
/auth
/interests
/sources
/feed
/summaries
/settings
```

Entity routes are added only after the feature has typed route params and tests.

Preferred future patterns:

```text
/interests/:interestId
/sources/:sourceId
/feed/:mentionId
/summaries/:summaryId
/settings/workspace
```

## Summary Naming

`Summary` is the product term for the aggregated view of posts, source mix,
top reads, citations and next actions. Frontend UI must not introduce a second
visible concept named `ReaderSummary`.

`ReaderSummary` may remain as a backend/API artifact name while the backend contract
is being migrated. Presentation copy, navigation labels and empty/loading/error
states should say `Summary`. Future cleanup should rename internal
workspace-level reader summary contracts to `WorkspaceSummary` or `ReaderSummary`
after OpenAPI, generated clients and backend tests can move together.

Query params are allowed only through `RouteQueryContract`.
Filters with complex state should use typed query objects and shareable saved views, not ad hoc query strings.

## Empty And Repair States

Every feature page must have these state surfaces before production behavior:

- first-use empty state;
- filtered-empty state;
- loading state;
- partial/stale state;
- offline/degraded state when relevant;
- permission-required state;
- credential/source-disconnected repair state where relevant;
- not-found state for entity routes.

Permission and credential states must expose a stable repair action contract.
UI copy is presentation-only; domain/application layers expose stable codes.

## Back Behavior

Back behavior is product behavior:

- closing a detail panel returns to the list with selection, filters and scroll position intact;
- closing a modal returns to the same workflow step;
- leaving a dirty form asks for confirmation through action intent state;
- browser back must not bypass auth/workspace guards;
- mobile system back should match visible navigation depth.

Deep links to destructive actions are forbidden. Route to a review screen first.

## UX Done Gate

Before building a substantial feature, define:

- route contract and params;
- compact/medium/expanded layout behavior;
- empty/loading/error/permission/repair states;
- list/detail or form navigation behavior;
- back behavior;
- telemetry screen id and action ids;
- widget or route tests that prove the critical flow.
