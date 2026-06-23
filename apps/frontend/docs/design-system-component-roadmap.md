# Design-System Component Roadmap

## Purpose

This roadmap defines shared frontend components that must exist before features create private UI copies.
The design system wraps `flutter_headless` and product styling. Features import `social_monitor_design_system`, not raw UI primitives.

## Maturity Levels

Level 0 - Shell primitive:

- good enough for app shell or feature placeholder;
- has responsive constraints and basic accessibility;
- tested with widget tests.

Level 1 - Product primitive:

- supports loading, disabled, empty and error states where applicable;
- has semantic labels, focus behavior and text-scale behavior;
- works in compact and expanded layouts.

Level 2 - Workflow primitive:

- models real Social Monitor workflows;
- has action intent support, permission repair handling and telemetry hooks;
- has focused tests and optional golden coverage.

Do not create feature-private copies of Level 1 or Level 2 primitives.

## Existing Baseline

Current components:

- `AppAdaptiveShell`
- `AppButton`
- `AppEmptyState`
- `AppFeatureCard`
- `AppHeadlessScope`
- `AppPageSurface`
- `AppSectionHeader`
- `AppStatusBadge`

These are acceptable shell primitives, but not enough for real feature growth.

## P0 Components Before Heavy Feature Work

`AppWorkspaceSwitcher`

- shows active tenant/workspace;
- handles loading, missing workspace and permission-required states;
- does not expose sensitive names in telemetry by default.

`AppPermissionRepairSurface`

- renders signed out, workspace missing, permission required, credential expired and source disconnected states;
- accepts stable repair action contracts;
- used by auth, sources, feed and summaries.

`AppFilterBar`

- supports search, facets, chips, saved views and clear-all;
- responsive: compact collapses into filter sheet, expanded stays inline;
- emits typed filter changes, not raw maps.

`AppDataList`

- lazy list/table facade for operational data;
- supports loading rows, empty state, partial/stale badge, keyboard navigation and stable row keys;
- never takes raw provider DTOs.

`AppEntityHeader`

- title, status, metadata, primary actions and overflow actions;
- supports stale/degraded/permission states.

`AppResponsiveSplitView`

- list/detail layout for medium/expanded screens;
- compact turns detail into navigation or full-height panel;
- preserves list scroll and selection.

## P1 Components

`AppStatusTimeline`

- source health, scan attempts, summary generation and delivery events.

`AppCommandBar`

- primary/secondary actions with `UserActionIntent`;
- consistent destructive and credential-affecting confirmation.

`AppInlineProblem`

- maps `AppFailure` or feature failure into recoverable UI;
- supports retry and details disclosure without raw payloads.

`AppPaginationControls`

- cursor pagination, load-more and partial data messaging;
- pairs with `PageRequest` and `PageResult`.

`AppCredentialHealthBadge`

- source disconnected, credential expired, permission missing and provider degraded states.

## P2 Components

`AppEvidencePreview`

- safe rendering of provider content snippets, URLs and provenance.

`AppSavedViewSelector`

- saved filters/searches with workspace scope.

`AppAuditTrailPanel`

- high-level user-visible change history without raw payload leaks.

`AppDiagnosticsPanel`

- support-safe trace ids, route id, feature flag snapshot and high-level error categories.

## Component Acceptance Criteria

Every shared component must define:

- product purpose and owner;
- allowed data classes;
- disabled/loading/error behavior;
- responsive behavior;
- keyboard and focus behavior;
- semantic label strategy;
- text scale behavior;
- dark/light token mapping;
- tests proving the risky states.

## Anti-Duplication Rule

If two features need similar UI, promote it to the design system before the second copy lands.
If a component needs feature-specific domain language, keep a small feature wrapper around a shared design-system primitive.

