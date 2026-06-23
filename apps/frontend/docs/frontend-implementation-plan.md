# Frontend Implementation Plan

## Purpose

This is the master execution plan for building the Social Monitor frontend from the current architecture baseline to a usable MVP.
Follow it in order unless an ADR changes the sequence.

The plan assumes:

- web app is the first runtime;
- mobile constraints are first-class from the start;
- frontend features are DDD bounded contexts;
- app shell owns routing, workspace scope and composition;
- design system owns reusable UI primitives;
- features own product workflows only.

## Required Reading

Before implementing any phase, read:

- `../../../AGENTS.md`
- `../../../CLAUDE.md`
- `../AGENTS.md`
- `README.md`
- `frontend-ux-architecture.md`
- `design-system-component-roadmap.md`
- `frontend-state-playbook.md`
- `frontend-api-contract-playbook.md`
- `frontend-testing-strategy.md`
- `frontend-observability-decision.md`
- `frontend-security-privacy-policy.md`
- `../../../.claude/rules/flutter-frontend-quality.md`
- `../../../.claude/rules/ddd-clean-architecture-folders.md`

## How To Execute This Plan

Use this loop for every phase:

1. Read the phase goal and exit criteria.
2. Identify the smallest PR-sized slice that moves the phase forward.
3. Confirm which package owns the change: `app`, `design_system`, `shared_kernel`, `generated_api` or one feature package.
4. Implement only the artifacts named by the phase.
5. Add tests at the same layer as the risk.
6. Run the phase gates.
7. Update docs only when a rule or decision changes.
8. Stop when the exit criteria are true, then move to the next phase.

Do not skip a phase because a later screen is more visible.
If a later phase appears blocked by missing backend contracts, build only typed fake contracts and mapper tests needed to keep the frontend architecture honest.

For each implementation slice, write or keep a short local work packet before editing:

- owner package and bounded context;
- exact route, store, use case, mapper or design-system component being changed;
- runtime path affected: normal, demo/dev or test-only;
- required tests and gates for that slice;
- stop condition if the slice needs an ADR, backend contract or new dependency.

## Build Strategy

Build in this order:

```text
Design-system P0 primitives
-> app shell runtime
-> API and state contracts
-> auth and workspace bootstrap
-> topics vertical slice
-> sources vertical slice
-> feed vertical slice
-> summaries vertical slice
-> settings and diagnostics
-> realtime/cache/performance hardening
-> security/privacy/observability release hardening
```

Do not start with feature screens that need private filters, tables, detail panels or permission surfaces.
Those primitives must exist in the design system first.

## Execution Map

Use this table as the quick order-of-work index. The detailed phase sections below remain the source of truth.

| Phase | Primary owner | Main proof |
|---|---|---|
| 0. Baseline audit | `app`, package boundaries | Current gates are green before new product code |
| 1. Design-system P0 | `packages/design_system` | Shared primitives exist and have compact/expanded tests |
| 2. App shell runtime | `app` | Route guards, workspace/session context and safe unknown routes are tested |
| 3. API/state contracts | `shared_kernel`, `generated_api`, feature test support | Mapper, Problem Details, pagination and state patterns are executable examples |
| 4. Auth/workspace bootstrap | `features/auth`, `app` | Session restore, workspace switch and safe pending intent behavior are tested |
| 5. Topics | `features/topics` | First full vertical slice proves the architecture path |
| 6. Sources | `features/sources` | Credential repair and provider capability safety are tested |
| 7. Feed | `features/feed` | Cursor pagination, detail review and stale result handling are tested |
| 8. Summaries | `features/summaries` | Citation safety, generation state and feedback are tested |
| 9. Settings/diagnostics | `features/settings` | Support-safe diagnostics and preferences are tested |
| 10. Realtime/cache/performance | affected features, `shared_kernel` | Ordering, invalidation and repeated-row performance are proven |
| 11. Observability/security/privacy | `app`, affected features | Redaction and no direct SDK drift are tested |
| 12. MVP release candidate | whole frontend | Critical workflow passes end to end |

## MVP Critical Path

The shortest valuable path is:

```text
Shell with workspace context
-> topics create/edit
-> source connect/repair
-> feed review with filters/detail
-> summary detail with feedback
-> settings/diagnostics
```

Everything outside this path is secondary until the MVP acceptance workflow passes.
Secondary work can be planned, but it must not force architecture exceptions or delay P0 primitives.

## Temporary Fake Data Contract

Typed fake data is allowed only to protect architecture while backend contracts are incomplete.
It must follow these rules:

- fake adapters live in app composition, feature test support or clearly named demo infrastructure, never in domain;
- fake DTOs must still pass through infrastructure mappers before reaching application or presentation;
- fake data must use redacted, unrealistic values;
- fake adapters must expose the same async, failure, permission and workspace-scope behavior as the real contract will need;
- every fake path needs a removal condition: generated endpoint ready, backend contract approved or feature disabled;
- no phase can be called production-ready while unmarked fake data is reachable from the normal runtime path.

After Phase 4, placeholders are not enough for MVP progress.
After Phase 12, fake/demo adapters may remain only behind explicit demo or test composition.

Runtime path definitions:

- normal runtime path means the composition used by the app entrypoint that users would run for web MVP review;
- demo/dev path means explicitly named demo composition, fake repositories or in-memory API clients that are not reachable without a demo/dev selector;
- test-only path means fixtures, fake clients and widget-test composition under `test/` or test support folders;
- production-ready path means normal runtime uses generated clients or approved backend contracts, with demo/fake data either removed, disabled or clearly isolated behind demo/dev composition.

## Global Done Gates

Run the smallest useful subset during each step.
Before claiming a phase complete, run:

```sh
cd apps/frontend
fvm flutter analyze
fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart
```

Before major handoff or merge, run from repo root:

```sh
npm run check:frontend
npm run check:agent-quality-rules
npm run check:code-quality
npm run check:architecture
git diff --check
```

Never run agent launch, provisioning, terminal-runtime, task-assignment or smoke-flow checks on this real project.
If a root npm script is new, changed or unclear, inspect it before running and use focused non-prohibited checks instead.

## Phase Entry And Exit Contract

Before entering a phase:

- the previous phase exit criteria are true;
- architecture boundary tests are green;
- no unresolved stop condition exists;
- every new dependency or SDK has an ADR or accepted playbook rule.

Before leaving a phase:

- named artifacts exist;
- tests prove the highest-risk state transitions;
- compact and expanded behavior is covered when UI changes;
- no feature-private duplicate of a design-system primitive was introduced;
- no raw generated DTO, raw route path, direct env flag, direct observability SDK or raw provider payload escaped into feature presentation.

A phase is not complete if the UI only renders happy-path fake data, if failure/permission states are untested, or if the next phase would need to undo an architectural shortcut.

## Phase 0 - Baseline Audit

Goal:

- confirm the frontend platform baseline is still green before adding product code.

Work:

- run frontend architecture boundary test;
- inspect current feature packages and design-system exports;
- check that every feature `AGENTS.md` links to frontend playbooks;
- check that no feature imports raw headless, routing, generated API or another feature internals;
- check current app shell route registry.

Exit criteria:

- `npm run check:frontend` passes;
- architecture test passes;
- no unplanned architecture exceptions are needed.

## Phase 1 - Design-System P0 Primitives

Goal:

- prevent feature-private UI copies before real screens are built.

Build order:

- `AppInlineProblem`
- `AppPaginationControls`
- `AppPermissionRepairSurface`
- `AppDataList`
- `AppFilterBar`
- `AppEntityHeader`
- `AppResponsiveSplitView`
- `AppWorkspaceSwitcher`
- `AppCommandBar`

Reason:

- problem and pagination surfaces are low-level;
- repair, list and filter components unblock feature screens;
- split view and workspace switcher integrate with shell behavior;
- command bar depends on action intent conventions.

Implementation rules:

- keep components in `packages/design_system/lib/src/components`;
- split complex components into folders before they approach 250 lines;
- use headless wrappers through existing design-system patterns;
- support compact and expanded layouts;
- support loading, disabled, empty, error and permission states where relevant;
- expose typed inputs, not raw feature DTOs;
- add widget tests for compact and expanded behavior.

Exit criteria:

- design-system tests cover every P0 component;
- no feature contains a private duplicate of these components;
- components export from `social_monitor_design_system.dart`;
- `fvm flutter test packages/design_system` passes.

## Phase 2 - App Shell Runtime

Goal:

- make workspace, auth, route, capability and observability context real at the shell level.

Build:

- workspace switcher integration in app shell;
- active workspace state holder in app composition;
- auth/session bootstrap state with typed fake adapter until the real backend contract is wired;
- typed route guard policy for signed out, workspace missing and permission required;
- capability snapshot injection through app composition;
- provider-neutral frontend observability facade;
- route/screen trace context creation;
- app-level unknown route and safe pending-intent behavior.

Implementation rules:

- app shell owns route path strings and redirects;
- features receive typed route inputs and capability/access states;
- feature flags fail closed;
- telemetry uses screen/action/correlation ids and redacted fields;
- no feature reads environment variables or logging SDKs directly.

Exit criteria:

- app widget tests cover compact and expanded shell navigation;
- route tests cover unknown route, workspace missing and signed-out behavior;
- architecture test still blocks route path strings in features.

## Phase 3 - API And State Contract Foundation

Goal:

- make backend integration predictable before feature-specific API work grows.

Build:

- `shared_kernel`: pagination, sorting, workspace scope, async state and stale-result guard examples needed by the first real slices;
- `generated_api`: Problem Details mapping tests and generated-client boundary checks;
- feature test support: shared mapper fixture builders and redacted payload factories;
- feature infrastructure: endpoint-specific mapper file pattern with one concrete example;
- feature application: typed query and command naming examples that return `Result`;
- feature infrastructure repositories: cache owner pattern with in-memory default only;
- future realtime contracts: adapter interface pattern with cursor, sequence, schema version and resync-required state.

Implementation rules:

- generated API imports stay in infrastructure only;
- application use cases return `Result`;
- mappers handle unknown enum values and optional fields;
- fixtures are fake and redacted;
- every endpoint mapper gets focused tests.

Exit criteria:

- generated API package tests pass;
- at least one example mapper test pattern exists before multiple feature mappers are added;
- one use-case query or command example shows `Result` plus typed failure mapping;
- one stale-result guard example exists before async feature stores multiply;
- no generated DTO leaks into stores or widgets.

## Vertical Slice Definition

A feature vertical slice is complete only when it includes:

- product-language domain concepts where behavior needs them;
- application use cases returning `Result`;
- infrastructure mappers for generated API DTOs;
- presentation store with typed async/access/action state;
- route/page composed from design-system primitives;
- tests for value objects or policies, use cases, mappers, stores and primary widgets;
- compact and expanded layout behavior when the feature has list/detail or form flow;
- no architecture exceptions.

Placeholder pages are allowed only before Phase 4.
After Phase 4, a feature route should either be a real vertical slice or a clearly disabled capability with a reason.

## Phase 4 - Auth And Workspace Bootstrap

Goal:

- make the app usable with correct session and workspace state before feature data appears.

Build:

- auth route states: signed out, restoring, ready, failed;
- workspace selection and missing-workspace state;
- credential/session expired repair surface;
- pending safe intent resume after sign-in;
- shell-level user/workspace display through `AppWorkspaceSwitcher`;
- auth feature use cases and stores once bootstrap has async, failure or repair behavior.

Tests:

- session restore success/failure;
- workspace switch invalidates scoped state;
- signed-out route guard;
- pending intent resumes only when safe.

Exit criteria:

- user can see shell with active workspace state;
- feature routes do not show stale workspace data;
- auth/workspace states use shared access taxonomy.

## Phase 5 - Topics Vertical Slice

Goal:

- implement the first real business feature with the full architecture path.

Build:

- topic list route;
- topic filters/search through `AppFilterBar`;
- topic list through `AppDataList`;
- topic detail/header through `AppEntityHeader`;
- create/edit/archive topic form workflow;
- domain value objects for topic id, name, rules and status;
- use cases for list, create, update and archive;
- infrastructure mappers for topic endpoints;
- store recipes for list/filter/selection and form workflow.

Tests:

- value object validation;
- use-case success and expected failures;
- mapper unknown enum and missing optional field;
- store stale result rejection;
- widget tests for empty, loading, ready, validation and permission states.

Exit criteria:

- topics is the reference slice for future features;
- no private UI clone of design-system P0 components;
- architecture and frontend gates pass.

## Phase 6 - Sources Vertical Slice

Goal:

- implement source catalog, source health and credential repair safely.

Build:

- source list and detail;
- source connection/repair workflow;
- credential expired and source disconnected surfaces;
- provider capability display through fail-closed capabilities;
- source health timeline when API exposes scan or health events; otherwise show latest health summary only;
- domain concepts for source id, binding id, provider capability and credential health;
- use cases for list sources, connect, reconnect, pause/resume and load health.

Tests:

- credential repair action intent;
- permission-required and source-disconnected states;
- provider capability unknown fallback;
- mapper redaction tests;
- workspace switch clears repair state.

Exit criteria:

- no token, OAuth code or credential detail is logged, stored or shown;
- source health can be displayed without raw provider payloads;
- privacy checklist passes.

## Phase 7 - Feed Vertical Slice

Goal:

- implement the core monitoring review workflow.

Build:

- feed list with cursor pagination;
- filters and saved filter-ready state shape;
- mention detail panel through responsive split view;
- provenance/evidence preview using safe rendering rules;
- triage actions with `UserActionIntent`;
- realtime-ready event merge path;
- stale/partial/offline states;
- scroll and selection preservation.

Tests:

- pagination append and duplicate handling;
- filter change discards late result;
- workspace switch clears feed data;
- detail route invalid id behavior;
- realtime duplicate/stale/gap behavior if realtime is wired;
- compact and expanded list/detail behavior.

Exit criteria:

- feed can handle large lists lazily;
- no raw provider DTOs or payload dumps enter presentation;
- performance review is done for repeated rows.

## Phase 8 - Summaries Vertical Slice

Goal:

- implement summary review with citations, generation status and feedback.

Build:

- summary list;
- summary detail;
- citations/evidence display;
- regeneration or refresh workflow;
- feedback workflow;
- generation status handling through polling or realtime-ready state;
- degraded and partial states for missing evidence.

Tests:

- mapper handles unknown generation status;
- feedback action idempotency;
- regeneration disabled states;
- citation rendering redacts unsafe values;
- detail screen stale result rejection.

Exit criteria:

- summary content is display-safe;
- generation status does not require a giant store;
- feedback workflow has typed actions and tests.

## Phase 9 - Settings And Diagnostics

Goal:

- provide workspace governance, preferences and support-safe diagnostics.

Build:

- workspace settings shell;
- notification/digest preference surfaces if in MVP;
- privacy/telemetry consent surface: real flow when backend privacy contract exists, disabled not-configured surface otherwise;
- diagnostics panel with trace id, route id, release version and feature snapshot;
- support-safe copy actions.

Tests:

- preference validation;
- consent state changes;
- diagnostics redaction;
- permission-required settings state.

Exit criteria:

- support diagnostics contain enough context without provider payloads;
- privacy and telemetry choices match policy.

## Phase 10 - Realtime, Cache And Performance Hardening

Goal:

- harden the real data paths after core vertical slices exist.

Work:

- introduce realtime adapters only where product value is clear;
- use `RealtimeEventOrderGuard` for all streams;
- define cache TTL and invalidation per feature repository;
- ensure workspace switch clears caches and realtime guards;
- profile feed and summaries repeated rows;
- remove expensive computed getters from stores;
- verify lazy list behavior.

Tests:

- event duplicate/stale/gap cases;
- cache fresh/stale/expired behavior;
- workspace switch invalidation;
- scroll performance smoke with 100 or more fake rows; if tooling is unavailable, record the exact blocker.

Exit criteria:

- no feature handles realtime without ordering guard;
- no persistent cache exists without ADR;
- dense screens remain responsive on compact and expanded layouts.

## Phase 11 - Observability, Security And Privacy Hardening

Goal:

- make diagnostics and privacy behavior release-ready.

Work:

- choose first observability adapter: default to Sentry after privacy review, use custom backend sink if privacy or procurement rejects Sentry, and do not add a direct Flutter OTel SDK yet;
- keep facade provider-neutral;
- wire redacted frontend logs and non-fatal reporting;
- define event catalog before analytics;
- audit local storage;
- audit screenshots, fixtures and golden tests;
- verify app store privacy implications for mobile release.

Tests:

- redaction tests;
- no direct SDK import in features;
- no raw provider payloads in fixtures;
- capability and permission states fail closed.

Exit criteria:

- telemetry can diagnose failures without leaking sensitive data;
- privacy policy and implementation match;
- architecture tests block direct SDK drift.

## Phase 12 - MVP Acceptance And Release Candidate

Goal:

- prove the frontend is cohesive end to end.

Acceptance workflow:

1. Sign in or restore session.
2. Select or confirm workspace.
3. Create or edit a topic.
4. Connect or repair a source.
5. Review feed items with filters and detail view.
6. Open summary detail and submit feedback.
7. Change a workspace setting.
8. Capture support-safe diagnostics for a simulated failure.

Acceptance proof:

- add one app-level widget or integration test that exercises the full workflow through route navigation and user actions;
- cover compact, medium and expanded layout smoke for the workflow or the route set that contains it;
- keep feature-level tests for loading, empty, ready, failure and permission/repair states;
- do not count isolated feature tests as a replacement for the app-level critical workflow.

Required checks:

- `npm run check:frontend`
- `npm run check:agent-quality-rules`
- `npm run check:code-quality`
- `npm run check:architecture`
- `cd apps/frontend && fvm flutter analyze`
- `cd apps/frontend && fvm flutter test app`
- `cd apps/frontend && fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart`
- `cd apps/frontend && fvm flutter test packages/design_system`
- `cd apps/frontend && fvm dart test packages/shared_kernel packages/generated_api`
- `cd apps/frontend && fvm flutter test features/auth features/topics features/sources features/feed features/summaries features/settings`
- security/privacy checklist for provider data
- responsive smoke for compact, medium and expanded layouts, using fixed test sizes such as 390x844, 834x1112 and 1280x900 when widget tests are enough
- `git diff --check`

Exit criteria:

- every critical workflow has a tested loading, empty, ready, failure and permission/repair state;
- normal runtime is not backed by unmarked fake/demo adapters, and any remaining fake/demo path is isolated by an explicit demo/dev or test-only composition;
- no human Dart file exceeds size budgets;
- no feature has private copies of P0 design-system primitives;
- no feature bypasses app route/workspace/capability contracts;
- no sensitive provider data is stored, logged or committed in fixtures.

## PR Slicing

Preferred PR order:

1. Design-system P0 components.
2. App shell runtime and route guards.
3. API/state contract examples.
4. Auth/workspace bootstrap.
5. Topics reference slice.
6. Sources slice.
7. Feed slice.
8. Summaries slice.
9. Settings/diagnostics.
10. Hardening and release candidate.

Each PR should be small enough to review but complete enough to keep gates green.
Do not merge placeholders that require architecture exceptions to become useful later.

## First Three PRs

PR 1 - Design-system foundation:

- implement `AppInlineProblem`, `AppPaginationControls`, `AppPermissionRepairSurface`;
- add compact/expanded widget tests;
- export components from design-system barrel;
- run design-system tests and architecture gate.

PR 2 - Operational layout primitives:

- implement `AppDataList`, `AppFilterBar`, `AppEntityHeader`, `AppResponsiveSplitView`;
- test lazy/list states, filter states and responsive split behavior;
- update one existing placeholder page only when it is needed to prove integration.

PR 3 - App shell runtime:

- integrate `AppWorkspaceSwitcher`;
- add shell state for workspace/auth/capability using typed fake implementations until backend integration;
- add route guard tests for signed out, workspace missing and unknown route;
- keep feature routes free of raw paths and redirects.

## Parallel Work Rules

Can run in parallel:

- design-system component tests and app shell route tests;
- mapper tests and backend contract review;
- feature domain/use-case work and design-system primitive work after APIs are stable.

Must not run in parallel without coordination:

- app route registry changes;
- shared-kernel primitive changes;
- design-system P0 API changes;
- generated API refresh;
- workspace/auth state model changes.

## Stop Conditions

Stop and write an ADR or update the playbook if:

- a feature needs persistent cache;
- a feature needs direct observability SDK access;
- a feature needs another feature package dependency;
- route paths must move into a feature;
- generated DTOs appear useful outside infrastructure;
- a private component duplicates a design-system P0 primitive;
- a store starts owning more than one major workflow.

## Final Quality Target

Before frontend MVP release, the implementation should score:

- Architecture: 9/10
- Code quality: 9/10
- Testability: 8/10
- Responsive/adaptive readiness: 8/10
- Accessibility baseline: 8/10
- Security/privacy posture: 9/10
- Maintainability under feature growth: 9/10
