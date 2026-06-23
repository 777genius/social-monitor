# Flutter Frontend Quality Rules

These rules exist so agents build Flutter frontend code that does not collapse into large screens, god stores and late refactors. They are based on current project architecture docs, official Flutter/Dart guidance and concrete failure modes observed in `clean_disk`.

## Research Anchors

- Flutter app architecture guide: https://docs.flutter.dev/app-architecture/guide
- Flutter architecture recommendations: https://docs.flutter.dev/app-architecture/recommendations
- Flutter adaptive and responsive design: https://docs.flutter.dev/ui/adaptive-responsive
- Flutter adaptive best practices: https://docs.flutter.dev/ui/adaptive-responsive/best-practices
- Flutter performance best practices: https://docs.flutter.dev/perf/best-practices
- Dart Effective Dart style/design/usage: https://dart.dev/effective-dart
- Project headless decision: `docs/architecture-memory/255-flutter-headless-component-integration.md`
- Project design token decision: `docs/architecture-memory/216-flutter-design-token-governance.md`
- Project Flutter release gates: `docs/architecture-memory/177-flutter-testing-release-gates.md`
- Frontend playbook index: `apps/frontend/docs/README.md`
- Frontend UX playbook: `apps/frontend/docs/frontend-ux-architecture.md`
- Frontend design-system roadmap: `apps/frontend/docs/design-system-component-roadmap.md`
- Frontend state playbook: `apps/frontend/docs/frontend-state-playbook.md`
- Frontend API contract playbook: `apps/frontend/docs/frontend-api-contract-playbook.md`
- Frontend testing strategy: `apps/frontend/docs/frontend-testing-strategy.md`
- Frontend observability decision: `apps/frontend/docs/frontend-observability-decision.md`
- Frontend security/privacy policy: `apps/frontend/docs/frontend-security-privacy-policy.md`

## Non-Negotiable Rules

- Human-written Dart files must stay under 600 lines.
- Generated files are the only exception. Generated files must live under a generated path or have a generated header.
- If a file reaches 500 lines, split it before adding new behavior.
- If a file is already over 600 lines, do not add behavior there. Extract first.
- Route pages compose sections only. They do not own business logic, large private widget catalogs or data mapping.
- Route pages must stay below 12 private declarations, 30 direct `store.` reads and 40 direct `l10n.` reads. Passing any threshold means split into sections, view models or sub-stores.
- MobX stores are presentation controllers only. They do not become feature god objects.
- Stores must stay below 8 distinct use-case dependencies, 20 observables and 12 actions. Passing any threshold means split by workflow before adding behavior.
- Stores use `AsyncViewState<T>`, `AppFailure`, `OperationGenerationGuard` and `WorkspaceRequestGuard` for async/realtime state. Do not model workflow state as loose `isLoading`/`error` fields.
- Risky, destructive, expensive or credential-affecting UI actions use `UserActionIntent` or a feature-specific equivalent with id, risk, disabled reason, confirmation policy and idempotency key.
- Route paths, query contracts, auth redirects and deep-link policy are app-shell responsibilities. Features consume typed route inputs, not raw path strings.
- Workspace scope is first-class. API requests, cache entries, realtime events and store snapshots must reject stale workspace or tenant data.
- Realtime input requires event id, schema version, cursor, monotonic sequence, dedupe, stale discard and resync-required state.
- Frontend cache is in-memory by default. Persistent cache or secure storage in a feature requires an ADR and architecture-test exception.
- Feature flags and rollout capability checks are composition state. Features do not read environment variables, dotenv or compile-time flags directly.
- Observability uses correlation ids, screen ids, action ids and redacted log fields. Raw provider payload logs are forbidden.
- Feature code imports `design_system`, not raw `headless`, Syncfusion, charting packages or package-specific UI primitives.
- Domain and application layers never import Flutter, MobX, `go_router`, generated API clients, DTOs or third-party UI packages.
- Feature packages may declare MobX for presentation stores and `generated_api` for infrastructure adapters, but imports are layer-gated.
- `modularity_flutter` is the default feature route/module boundary. Use it only in app root, `presentation/routes` and `presentation/composition`.
- Do not add `flutter_modular` or `get_it` to frontend packages by default. Extra DI/module libraries require an ADR and an architecture test exception.
- Generated API clients are outer-boundary details. Feature code may use them only inside infrastructure.
- Generated DTOs must be translated in infrastructure mappers or anti-corruption folders before reaching application, domain, stores or widgets.
- Localization is presentation-only. Domain, application, infrastructure, generated API and shared kernel must not import localization APIs or depend on localized copy.
- Frontend tests keep scenario files split by layer/workflow, with fixtures and builders in `test/support`.
- Frontend fixtures, logs and screenshots must not contain raw provider payloads, realistic tokens, API keys, secrets or PII.
- Responsive behavior is built from constraints and breakpoints, not device or orientation guesses.
- Frontend feature packages are bounded contexts. New features use the canonical scaffold from `npm run frontend:create-feature`, including route/module composition and DDD docs.
- Frontend work starts from `apps/frontend/AGENTS.md`; feature work also reads the local feature `AGENTS.md`.
- Real feature growth also reads `apps/frontend/docs/README.md` and the relevant pre-scale playbooks before adding screens, stores, API mappers, telemetry or provider-data UI.
- Every frontend feature must have a local `AGENTS.md` that links to the shared DDD/Clean Architecture standards.
- Do not create default `ports/` or `adapters/` folders under `features/*/lib/src`.
- Broad dump files named `models.dart`, `dtos.dart`, `mapper.dart`, `mappers.dart`, `widgets.dart`, `helpers.dart`, `utils.dart` or generic `manager.dart` are forbidden in frontend code. Use product-language names.
- Every frontend change must include the smallest executable evidence that proves the changed surface.
- Architecture guardrails in `apps/frontend/app/test/architecture/frontend_architecture_boundaries_test.dart` are product safety gates. Do not remove or weaken them without replacing them with an equal or stronger executable gate.
- Analyzer options must keep `strict-casts`, `strict-inference` and `strict-raw-types` enabled for every frontend package through the shared root include.

## Executable Frontend Gates

The frontend architecture test currently enforces these standards:

- feature inner layers do not import Flutter UI, MobX, routing, generated API clients or design-system packages where forbidden;
- feature presentation does not import other feature `src/` internals;
- feature packages do not import raw `headless`, `headless_adaptive` or unapproved UI primitive packages;
- frontend packages use `modularity_flutter` only in app root or feature route/module composition, and do not import or depend on `flutter_modular` or `get_it` without an explicit architecture decision;
- feature package dependencies block routing, raw headless packages and other feature packages, while MobX and `generated_api` are constrained by layer import tests;
- `headless_adaptive` is consumed from pinned upstream `777genius/flutter_headless`, not from a local frontend package directory;
- human Dart files stay inside size budgets, with tighter budgets for design-system components, routing, composition, presentation and tests;
- shared analyzer options stay strict across frontend packages;
- route pages stay below clean-disk drift thresholds for private declarations, direct store reads and direct localization reads;
- stores stay below clean-disk drift thresholds for use-case dependencies, observables and actions;
- feature folders have local `AGENTS.md`, docs, route entrypoint, module, module host and page from the canonical DDD scaffold, and do not use technical `ports/` or `adapters/` folders as the default architecture;
- import, export and part directives cannot bypass DDD layer direction or raw package bans;
- broad dump filenames are blocked before they become `models.dart`, `dtos.dart`, `mapper.dart` or `widgets.dart` catalogs;
- feature pubspecs do not depend on routing, raw headless packages or other feature packages;
- MobX is allowed only for presentation state, and `generated_api` is allowed only for infrastructure adapters/mappers;
- app shell imports feature public barrels only, not feature `src` internals;
- shared kernel stays framework-neutral and does not import Flutter, routing, MobX, generated API, design system or feature packages;
- `design_system` does not depend on app, features, generated API, shared kernel, routing or MobX;
- `generated_api` does not depend on `dart:io`, Flutter, app, features, design system, routing or MobX;
- feature public barrels expose route entrypoints only.
- async stores avoid loose loading/error fields and guard late async results;
- feature tests stay out of root mega-test files and avoid realistic secrets;
- generated DTO imports stay in infrastructure anti-corruption, mapper, client or data-source folders;
- localization imports stay out of inner layers and shared packages.
- runtime scaling contracts stay centralized: features do not add raw route paths, direct env flags, console logging, persistent cache packages or realtime streams without order guards;
- app feature descriptors expose typed `FeatureRouteContract` values from the app composition root.

When a future feature needs a new exception, add a narrow public abstraction or wrapper first. If the exception is still necessary, update the test with an explicit reason and add review evidence.

## Clean Disk Lessons

| Observed in `clean_disk` | Evidence | Risk /10 | Rule for this repo |
|---|---:|---:|---|
| Massive page file | `features/scan/lib/src/presentation/pages/scan_home_page.dart` - 8438 lines | 10 | Split route, layout sections, dialogs, rows, banners and helpers into separate files before 500 lines. |
| God presentation store | `scan_workspace_store.dart` - 2439 lines | 10 | Split stores by workflow: session, filters, tree, selection, cleanup, permissions, realtime. |
| Massive widget test | `scan_home_page_test.dart` - 2758 lines | 8 | Split tests by scenario and move builders/fixtures into test support files. |
| Store test mirrors god store | `scan_workspace_store_test.dart` - 2250 lines | 8 | Test smaller stores/use cases independently instead of one huge state machine test. |
| Domain model aggregation too large | `scan_models.dart` - 1227 lines | 8 | Split domain by aggregate/value-object family and keep public barrels curated. |
| DTO protocol and mapper too large | `scan_protocol_dtos.dart` - 1120, `scan_dto_mapper.dart` - 850 | 8 | Split DTOs/mappers by endpoint or aggregate. Add mapper tests per split. |
| Design-system component too large | `app_tree_table.dart` - 897 lines | 7 | Complex components need subcomponents, controller/model files and focused tests. |
| Boundary tests existed but missed size debt | architecture tests caught imports, not file complexity | 7 | Add line-budget checks or review gates for human files. |
| Local dependency overrides can break portability | `headless` was overridden to `../headless/...` | 6 | Prefer hosted pinned versions unless the sibling repo is guaranteed and documented. |
| Scoped module library did not stop UI bloat | `modularity_flutter` scoped `ScanModule`, but `scan_home_page.dart` still reached 8438 lines and `scan_workspace_store.dart` 2439 lines | 7 | Use module scopes as required feature boundaries, but keep DDD folders, file budgets and workflow-scoped stores as separate executable gates. |
| Third-party renderer wrapper was isolated well | `syncfusion_disk_usage_map_adapter` package | 3 | Keep this pattern: vendor UI/rendering packages belong behind design-system or infrastructure wrappers, not features. |
| Headless wrapped by design system was correct | `AppHeadlessScope`, `AppButton`, `AppTextField` | 2 | Preserve this pattern. Features never import headless directly. |

## File Size Budget

Hard limits:

- 600 lines max for every human-written Dart file.
- 600 lines max for tests too. Split fixtures, builders and scenarios instead of making one mega-test.
- 12 private declarations max in a route page.
- 30 direct `store.` references max in a route page.
- 40 direct `l10n.` references max in a route page.
- 8 distinct use-case dependency types max in one store.
- 20 observable fields/collections max in one store.
- 12 MobX actions max in one store.
- 400 lines preferred max for presentation widgets.
- 350 lines preferred max for stores/controllers.
- 350 lines preferred max for mappers.
- 300 lines preferred max for use cases.
- 250 lines preferred max for reusable design-system components.
- These budgets are enforced for frontend Dart files by the architecture boundary test. If a budget blocks a valid change, split the file before raising the budget.

When a file approaches the limit:

- Split by responsibility, not by random line ranges.
- Extract widgets when they have their own state, callbacks, semantics or layout constraints.
- Extract pure formatting and mapping into focused files with tests.
- Extract async workflows into use cases or store collaborators.
- Keep public exports intentional. Do not export every private split automatically.

Allowed exceptions:

- localization generated output;
- OpenAPI generated clients;
- build runner output;
- platform generated Flutter files.

Exception requirements:

- The file path or header must make generation obvious.
- Agents must not manually edit generated files.
- If generated output is too large for review, review the generator input and snapshot diff instead.

## Package And Layer Shape

Recommended frontend shape:

```text
apps/frontend/
  app/
    lib/src/app/
    lib/src/composition/
    lib/src/routing/
  packages/
    design_system/
    shared_kernel/
    generated_api/
  features/<bounded_context>/
    AGENTS.md
    docs/
      ubiquitous_language.md
      context_map.md
    lib/src/domain/
      aggregates/
      entities/
      value_objects/
      domain_events/
      policies/
      specifications/
      repositories/
      domain_services/
    lib/src/application/
      use_cases/
      commands/
      queries/
      handlers/
      results/
      contracts/
    lib/src/infrastructure/
      api/
      api_clients/
      persistence/
      realtime/
      storage/
      mappers/
      repositories/
      data_sources/
      anti_corruption/
    lib/src/presentation/
      routes/
      composition/
      pages/
      layout/
      components/
      stores/
      view_models/
      workflows/
      formatters/
```

Layer responsibilities:

- `app` owns `MaterialApp`, `GoRouter`, route registration and composition roots only.
- `design_system` owns tokens, themes, headless wrappers and reusable product UI.
- `shared_kernel` owns framework-neutral primitives: `Result`, failures, ids, scope, clocks, pagination, async state.
- `generated_api` owns generated REST client wrappers and Problem Details mapping.
- `domain` owns bounded-context language, aggregates, entities, value objects, domain events, policies, specifications, repositories and domain services.
- `application` owns use cases, commands, queries, application contracts and typed workflow results.
- `infrastructure` owns generated API clients, DTO mapping, persistence/cache/realtime implementations and external SDKs.
- `presentation` owns feature routes, module composition, widgets and MobX presentation stores.

Public API rules:

- Feature package barrels expose route entrypoints only by default.
- Do not export feature `domain`, `application`, `infrastructure` or broad `src` internals from public barrels.
- If app composition needs feature behavior, expose a small public facade or route registration object, not the whole feature internals.
- Cross-feature collaboration goes through app composition, shared kernel primitives or backend/API contracts, not direct feature-to-feature dependencies.
- `modularity_flutter` is allowed only for app root setup, feature route entrypoints and feature module composition. It must not leak into pages, components, stores, domain, application or infrastructure.
- `design_system` is a product UI facade. It must not import feature packages, app routing, generated API, shared kernel, stores or business failures.
- Use product-language file names. Avoid generic catch-all names like `models.dart`, `widgets.dart`, `helpers.dart`, `utils.dart`, `manager.dart`, `dtos.dart` and `mapper.dart`.
- Use tactical DDD folders inside layers. Avoid default technical folders named `ports` and `adapters` in frontend features.
- New features must contain the canonical route/module/page scaffold from `npm run frontend:create-feature`.
- Do not place Dart files directly in `domain/`, `application/`, `infrastructure` or `presentation` roots. New files belong in tactical subfolders.

## Import Matrix

Allowed:

| Layer | May import |
|---|---|
| `domain` | Dart SDK, `shared_kernel`, same feature domain |
| `application` | domain, application contracts, `shared_kernel` |
| `infrastructure` | application/domain contracts, domain, `generated_api`, implementation packages, SDK clients |
| `presentation/routes` | Flutter, `modularity_flutter`, feature composition |
| `presentation/composition` | Flutter, `modularity_flutter`, application, infrastructure, domain for wiring |
| `presentation/stores` | application use cases, domain read models, `shared_kernel`, MobX |
| `presentation/widgets` | Flutter, `design_system`, stores, domain display models |
| `design_system` | Flutter, `headless`, design-system internals |
| `app` | feature public entrypoints, `design_system`, routing/composition packages |

Forbidden:

- `domain` or `application` importing Flutter, MobX, routing, generated clients, DTOs, HTTP clients or storage.
- `domain` importing application, infrastructure or presentation.
- `application` importing infrastructure or presentation.
- `infrastructure` importing presentation, Flutter UI, routing, MobX or design-system packages.
- `presentation` pages, components and stores importing infrastructure implementation files.
- Feature widgets importing `generated_api`, `headless`, Syncfusion/chart packages, `dart:io`, platform channels or direct HTTP clients.
- Feature packages importing another feature's `src/` internals.
- `design_system` importing app, features, MobX, DI, generated API, persistence or source-specific implementations.
- `shared_kernel` importing Flutter, app, features, generated API or infrastructure implementations.
- Runtime composition code hidden inside widgets or stores.

## Screen And Widget Rules

Route page rules:

- A route page wires a store, page-level actions and high-level layout only.
- It must not contain dozens of private widget classes.
- It must not contain DTO mapping, path parsing, API route strings or large formatting catalogs.
- It should be readable top-to-bottom in one review.
- It must split before reaching 12 private declarations, 30 direct `store.` references or 40 direct `l10n.` references.
- Dialogs, panels, rows, banners, toolbars and display formatters live in product-named files once they have their own callbacks, state, semantics or layout constraints.

Widget extraction rules:

- Extract a widget when it owns layout, state, semantics, focus, repeated rendering or callbacks.
- Prefer `StatelessWidget`/`StatefulWidget` over helper functions returning widgets for reusable UI.
- Keep `build` methods short enough to scan. If it needs comments to explain layout, it probably needs subwidgets.
- Use stable keys for dynamic lists where identity matters.
- Avoid nested cards and decorative containers that do not represent real structure.

Presentation model rules:

- Use small view models for display-only computed data.
- Keep formatting helpers near the view model or design-system formatter, not buried at the bottom of a 1000-line page.
- Do not pass domain aggregates deep into UI if the component needs only 3 display fields.

## Store And State Rules

MobX store rules:

- One store should represent one screen workflow or one cohesive UI state machine.
- Split stores by workflow before they exceed 350 lines.
- Split stores before they need more than 8 distinct use-case dependencies, 20 observable fields/collections or 12 actions.
- Stores call use cases. They do not instantiate repositories, generated clients or infrastructure implementations.
- Stores expose typed state and actions. Widgets should not mutate observable collections directly.
- Use typed async state: idle/loading/success/empty/failure/stale, not scattered booleans.
- Stale async results must be guarded when workspace, query, filter, route or selection changes.
- Realtime events update local presentation state only after validating session/workspace/snapshot identity.
- Long-running operations need cancellation or stale-result handling.

Async state taxonomy:

- Use `AsyncViewState<T>` or a feature-specific sealed state with the same explicit states.
- Required state vocabulary: initial, loading, ready, empty, partial, stale, offline, degraded, permission required, retrying and failure.
- Expected failures use `AppFailure` or feature-specific typed failures, not raw strings.
- Use `OperationGenerationGuard` for overlapping refresh, query, filter or route operations.
- Use `WorkspaceRequestGuard` when workspace or tenant scope can change.
- Never apply async results after the guard marks them stale.

Action intent rules:

- Risky, expensive, destructive or credential-affecting actions expose stable action ids.
- Disabled actions expose a stable reason code, not only localized copy.
- Confirmation policy and idempotency key are part of action state before the button is enabled.
- UI buttons render action state; they do not decide business policy directly.

Do not create:

- one store that owns routing, permissions, search, selection, cleanup, dialogs, realtime and details together;
- `isLoadingA`, `isLoadingB`, `lastFailureA`, `lastFailureB` fields without a typed state model;
- store methods that both call API, map DTOs, update navigation and format UI text.

## Runtime Scaling Contracts

Navigation and deep links:

- App composition owns `FeatureRouteContract`, route ids, path strings, query contracts, auth redirects and workspace-aware invalid-link behavior.
- Features do not call `context.go` with raw paths, parse URLs or own redirect policy.
- Deep-link tests belong in the app shell when routes, query params or workspace scope change.

Workspace scope:

- Active workspace/tenant scope is part of every API request, cache entry, realtime envelope and store snapshot that can leak data.
- Scope replacement invalidates pending operations, in-memory caches and presentation snapshots.
- UI must prefer stale/empty/refreshing state over showing data from the previous workspace.

Realtime:

- Realtime envelopes carry stream id, event id, schema version, sequence, cursor, workspace scope and payload.
- Stores apply realtime updates only after dedupe, sequence and workspace checks.
- Gaps or unsupported schema versions enter resync-required state instead of patching local state.

Cache and pagination:

- Cache is in-memory unless an ADR approves persistence for a named feature and data class.
- Every cache policy names owner, scope, TTL, stale behavior and invalidation trigger.
- Large lists use `PageRequest`/`PageResult` or a feature-specific equivalent before UI reaches production data volume.

Permissions and rollout:

- Access UX distinguishes signed out, workspace missing, permission required, credential expired and source disconnected.
- Disabled commands expose stable reason codes and repair actions, not only localized text.
- Feature flags and capabilities fail closed and are injected from app composition.

Observability:

- Error reporting includes correlation id, screen id and action id.
- Logs, tests and screenshots use `RedactedLogField` or fake data for sensitive values.
- Do not use `print`/`debugPrint` as product logging in feature code.

## Use Case And Data Rules

Use case rules:

- Use cases are small orchestration units with explicit inputs and typed outputs.
- Expected failures return `Result` or typed failure objects.
- Unexpected exceptions are translated at infrastructure or app boundaries.
- Use cases depend on domain/application contracts, not generated clients.

Mapper rules:

- Map DTOs at infrastructure boundaries.
- Generated API DTOs stay in `infrastructure/api_clients`, `infrastructure/data_sources`, `infrastructure/mappers` or `infrastructure/anti_corruption`.
- Unknown enum values require explicit behavior.
- Keep endpoint-specific mapping in endpoint-specific files.
- Mapper tests must cover missing fields, unknown enum values and failure payloads.

API rules:

- Do not manually patch generated clients.
- Do not expose DTOs to widgets or stores.
- Regenerate clients from contracts and commit generated output only when project policy requires it.
- Problem Details or API error payloads map into shared failures before reaching presentation.

Localization and fixture rules:

- Localization imports are presentation-only.
- Domain, application, infrastructure, generated API and shared kernel use stable codes, value objects and typed failures.
- Feature test files live under layer/workflow paths, not root-level mega-test files.
- Fixtures and builders live in `test/support` once shared by more than one scenario.
- Tests must use fake or redacted source payloads. Do not store realistic tokens, API keys, credentials, raw provider payloads or PII.
- Screenshots and failure logs must not include raw provider payloads or credential material.

## Design System And Headless Rules

Headless integration:

- `HeadlessApp` is wired once through `AppHeadlessScope`.
- `design_system` adapts headless components into product components.
- Features import only `package:social_monitor_design_system/social_monitor_design_system.dart`.
- Raw `package:headless/headless.dart` imports outside `design_system` are forbidden.
- Raw `package:headless_adaptive/headless_adaptive.dart` imports outside `design_system` are forbidden.
- `headless_adaptive` source of truth is `https://github.com/777genius/flutter_headless.git`, package path `packages/headless_adaptive`.
- The frontend must consume `headless_adaptive` from a pinned git commit, not from a local `apps/frontend/packages/headless_adaptive` package directory.
- Changing the pinned `headless_adaptive` commit requires wrapper test evidence and a quick API review in `design_system`.
- Feature packages never depend on `headless_adaptive` directly. If a feature needs adaptive behavior, add or extend a design-system wrapper first.
- `AppBreakpoints`, `AppAdaptiveShell` and future responsive product wrappers belong in `design_system`, not in feature screens.

Every design-system component must define:

- visual token mapping;
- disabled/loading/error behavior;
- min touch target;
- focus and keyboard behavior;
- semantic label strategy;
- text scale behavior;
- light/dark behavior;
- responsive constraints if size can vary.

Do not:

- fork headless behavior just to change color or spacing;
- add per-feature private button/input/card implementations;
- put source-specific or feature-specific behavior into `design_system`;
- let third-party rendering packages leak into feature widgets.

Third-party visual packages:

- Wrap them in design-system wrappers or narrow infrastructure implementation packages when they are domain-specific or heavy.
- Keep design-system dependency-free from feature-specific visual engines.
- Add architecture tests that block accidental imports.

## Responsive And Adaptive Rules

Flutter distinguishes responsive and adaptive design. Responsive means fitting the layout into available space. Adaptive means choosing UI patterns that are usable in that space.

Rules:

- Use constraints, `LayoutBuilder`, breakpoints and design-system screen classes.
- Do not base layouts on hardware type checks.
- Do not lock orientation.
- Do not build phone-only screens and hope they stretch to web.
- Do not let forms, cards or text fields consume unlimited desktop width.
- Use max-width content containers for reading and forms.
- Use side navigation or master-detail layouts on larger screens when it improves repeated work.
- Solve touch first, then add keyboard/mouse affordances.
- Preserve scroll position for lists/tabs where users compare or triage items.
- Test compact, medium and expanded layouts.

For this product:

- Web is the first runtime, but mobile constraints are first-class.
- Dense operational screens should prioritize scanability, not marketing-style hero layouts.
- Repeated workflows need efficient navigation, keyboard focus and predictable table/list behavior.

## Performance Rules

Follow Flutter performance guidance:

- Use `const` constructors wherever possible.
- Put observers/listeners as deep as possible so state changes do not rebuild the whole page.
- Prefer lazy lists/slivers for large collections.
- Avoid building large child lists eagerly.
- Avoid expensive intrinsic layout in scrollable or repeated children.
- Keep expensive formatting, sorting and grouping out of `build`.
- Cache derived display models when inputs are stable.
- Use stable keys for dynamic rows, tree nodes, tabs and animated lists.
- Do not add animations that make operational screens slower to scan.

Performance review is required when:

- a screen renders unbounded lists;
- a widget tree has nested scroll views;
- a component uses `IntrinsicHeight`, `IntrinsicWidth`, `LayoutBuilder` inside many rows or repeated `saveLayer` effects;
- a store update causes broad page rebuilds;
- a feature introduces charts, maps, trees or virtualized collections.

## Testing Rules

Minimum tests by change type:

- domain/value object: unit tests;
- use case: use-case tests with fake contracts;
- mapper: DTO success, missing fields, unknown enum and error payload tests;
- store: action/state transition tests, including stale async results;
- widget: loading/empty/error/success states and key interactions;
- design-system component: light/dark, disabled/loading/error, semantics and responsive smoke;
- route shell: navigation and deep link tests;
- architecture change: import-boundary tests;
- generated API contract: generation freshness and mapping tests.

Test file rules:

- Human-written test files also obey the 600-line limit.
- Split tests by behavior, not by arbitrary chunks.
- Shared builders live in `test/support/`.
- Large fixture JSON belongs in fixture files, not inline in test bodies.
- Avoid one mega-widget test that tries to prove an entire app.

Golden tests:

- Use for stable design-system primitives and critical responsive layouts.
- Do not make every feature screen golden-only. Behavior still needs widget/store tests.
- Golden diffs require token/theme review when they affect shared components.

## Accessibility And UX Rules

Every interactive component needs:

- semantic label or visible label;
- focus order that matches visual order;
- keyboard activation where applicable;
- disabled state semantics;
- loading/busy semantics for async actions;
- error text associated with the relevant control;
- minimum tap target;
- text scale smoke check for dense surfaces.

Feature screens need:

- clear empty states;
- recoverable error states;
- skeleton/loading states only where they reduce uncertainty;
- destructive action confirmation where data can be lost;
- no hidden critical action behind hover-only UI.

## Dependency Rules

- Before adding a Dart/Flutter package, check current stable version and maintenance state.
- Prefer hosted pinned versions for portable workspace resolution.
- Local `dependency_overrides` are allowed only when the sibling repo path is documented and available in the expected workspace.
- Do not add a package to solve one tiny helper unless the maintenance and bundle cost is justified.
- Heavy UI packages must be isolated behind infrastructure implementation packages or design-system wrappers.
- Dependency upgrades require focused tests for affected components.

## Agent Workflow Before Coding

1. Read the nearest architecture docs and this rule.
2. Inspect existing file sizes before editing.
3. If the target file is over 500 lines, plan a split before adding behavior.
4. Identify the layer you are changing and confirm imports match the matrix.
5. Check whether the component belongs in feature presentation, design system, infrastructure implementation or app composition.
6. Prefer the smallest vertical slice with tests over broad speculative framework work.
7. Do not run prohibited real-project agent launch/provisioning/terminal-runtime smoke flows.

## Before Claiming Done

Run the smallest checks that prove the changed frontend surface:

- Flutter dependency or workspace change: `flutter pub get`.
- Dart source change: `flutter analyze` for the frontend workspace.
- Design-system change: design-system package tests.
- App shell/routing change: app package tests.
- Feature change: affected feature tests plus architecture boundary tests.
- API client change: generated client freshness and mapper tests.
- Dependency change: current version check and focused tests.
- Full frontend platform gate: `npm run check:frontend` from the repository root.

If a check cannot run because the environment lacks Flutter/Dart tooling or a local dependency path, state the exact blocker and do not claim full verification.

## PR Review Checklist

- No human Dart file exceeds 600 lines.
- No new code was added to a file over 500 lines without splitting.
- Route pages are composition-only.
- Stores are workflow-scoped and not god objects.
- Domain/application imports are framework-free.
- Generated API and DTOs stay out of presentation.
- `headless` imports appear only in `design_system`.
- Responsive behavior is breakpoint/constraint-based.
- Large lists are lazy and preserve identity.
- Empty/loading/error/success states are tested.
- Semantics and keyboard/focus behavior are covered for new reusable controls.
- Tests are split and maintainable.
- Dependency changes are justified and current.

## Quality Score Target

New frontend work should score at least:

- Architecture: 8/10
- Code quality: 8/10
- Testability: 8/10
- Responsive/adaptive readiness: 8/10
- Accessibility baseline: 7/10 before feature polish, 8/10 before release
- Maintainability under growth: 8/10

Anything below these scores needs either a smaller scope, a split, stronger tests or an explicit follow-up risk note.
