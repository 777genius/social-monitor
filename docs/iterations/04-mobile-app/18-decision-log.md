# Iteration 04 - Decision Log

## Decision 001 - Feature-Scoped Clean Architecture

- Decision: Flutter features own domain, application, infrastructure and presentation layers.
- Alternatives: Global layered folders only.
- Rationale: Feature ownership stays clear as app grows.
- Consequences: More per-feature structure, less cross-feature coupling. Folder names use DDD language; `port` and `adapter` remain roles, not default folders.
- Revisit When: Shared domain concepts require explicit platform package.

## Decision 002 - MobX Stores As Presentation Orchestrators

- Decision: MobX stores orchestrate UI state and use cases only.
- Alternatives: Put business rules and API calls directly in stores.
- Rationale: Testability and Clean Architecture boundaries.
- Consequences: Requires use cases plus domain/application contracts per feature.
- Revisit When: A feature is truly view-only and has no domain behavior.

## Decision 003 - `flutter_headless` As Wrapped UI Primitive Source

- Decision: Use `flutter_headless` through a product `design_system` wrapper, not through direct feature imports.
- Alternatives: Direct package imports in every feature, custom widgets only, another UI package.
- Rationale: Component behavior stays consistent while product visuals, accessibility defaults and responsive constraints remain owned by the app.
- Consequences: The design system must own wrappers, tests and version/commit review.
- Required Evidence: Approved repository review, pinned commit/tag/version and design_system wrapper tests.
- Current Source: `https://github.com/777genius/flutter_headless.git`, package `packages/headless_adaptive`, pinned commit `eda0637`.
- Guardrail: `apps/frontend/app/test/architecture/frontend_architecture_boundaries_test.dart` blocks a local `packages/headless_adaptive` package directory and direct feature imports.
- Revisit When: Required controls are missing, package API becomes unstable or accessibility/responsiveness cannot be guaranteed through wrappers.

## Decision 004 - Executable Frontend Architecture Gates

- Decision: Treat `apps/frontend/app/test/architecture/frontend_architecture_boundaries_test.dart` as the primary frontend architecture gate.
- Alternatives: Keep rules only in docs, rely on code review, or add broad lints later.
- Rationale: This frontend will grow across many features, so dependency direction, public API shape and file-size budgets must fail fast before large files and hidden coupling become normal.
- Consequences: New feature packages must fit the dependency matrix, feature barrels expose route entrypoints only, app shell imports feature public APIs only, shared kernel and generated API stay framework-neutral, design-system imports stay product-UI only, strict analyzer options stay enabled, quoted imports cannot bypass checks and oversized Dart files must be split before adding behavior.
- Frontend Gate: `npm run check:frontend` runs frontend analyze, app tests, design-system tests, shared-kernel tests and generated-api tests.
- Required Evidence: Architecture boundary test, affected package tests and wrapper tests when design-system or `flutter_headless` behavior changes.
- Revisit When: A new architectural pattern needs a narrower explicit exception or a stronger replacement gate.

## Decision 005 - Canonical DDD Feature Scaffold

- Decision: Treat each frontend feature package as a bounded context and create every new feature through `npm run frontend:create-feature`.
- Alternatives: Keep manual page-only placeholders, hand-create full DDD folders, keep explicit `ports/` and `adapters` folders, use global layer folders, or put everything under presentation.
- Rationale: Agents can forget escalation rules. A generated scaffold gives every feature the same local `AGENTS.md`, DDD docs, route entrypoint, module boundary, module host and page from the first commit.
- Consequences: Every feature has a local `AGENTS.md`, `docs/ubiquitous_language.md`, `docs/context_map.md`, route/module composition and a narrow public barrel. Domain behavior must not be dumped into generic `models.dart`; application behavior must be split by use case/command/query; generated clients, DTO mapping and external SDK details live in infrastructure anti-corruption folders.
- Required Evidence: `apps/frontend/app/test/architecture/frontend_architecture_boundaries_test.dart` blocks missing scaffold files, missing local feature rules, `ports` and `adapters` folders, Dart files directly under `lib/src` or layer roots and inward dependency violations between DDD layers.
- Revisit When: A feature needs a cross-context integration pattern that cannot be named clearly as a repository, gateway, client or service.

## Decision 006 - Default Feature Module Boundary

- Decision: Use `modularity_flutter` as the default feature route/module boundary, while banning `flutter_modular` and `get_it` by default.
- Alternatives: Keep explicit app composition only, copy the thin `clean_disk` pattern, use `flutter_modular`, use `get_it` globally, or allow modules only for heavy features.
- Rationale: In `clean_disk`, `modularity_flutter` was correctly isolated but too thin to prevent giant page/store files. The fix is not to avoid module scopes; it is to make the module scope a mandatory narrow boundary and keep DDD, file budgets and workflow store splits as separate executable gates.
- Consequences: App root owns `ModularityRoot`; each feature public route entrypoint owns `ModuleScope`; feature `presentation/composition` owns module wiring and module hosts; `ModuleProvider.of` does not leak into pages, components, stores, domain, application or infrastructure.
- Required Evidence: `apps/frontend/app/test/architecture/frontend_architecture_boundaries_test.dart` requires feature route/module scaffold files, allows `modularity_flutter` only in app root plus feature route/composition files and blocks `flutter_modular` and `get_it`.
- Revisit When: Module scopes start carrying business logic or hiding feature-to-feature coupling.

## Decision 007 - Frontend Growth Safety Standards

- Decision: Require typed async state, stale-result guards, anti-corruption mapping, split test layout, presentation-only localization, sensitive fixture hygiene and explicit action intent for risky commands.
- Alternatives: Let each feature invent its own loading/error fields, stale-result handling, mapper layout, fixture style and button enablement policy.
- Rationale: `clean_disk` kept many package boundaries but still grew giant page, store, mapper, DTO and test files. Social Monitor has more async/realtime/provider data, so growth rules must be explicit before feature code grows.
- Consequences: Stores use shared typed state and operation/workspace guards; expected failures use `Result`/`AppFailure`; generated DTOs stay in infrastructure mapper or anti-corruption folders; tests split by layer/workflow with fixtures in `test/support`; localization does not enter domain/application/infrastructure; risky actions carry id, risk, disabled reason, confirmation policy and idempotency key.
- Required Evidence: `apps/frontend/app/test/architecture/frontend_architecture_boundaries_test.dart` blocks loose loading/error store state, unguarded async stores, generated DTO leaks, inner-layer localization imports, root-level feature mega-tests and realistic token/secret fixtures.
- Revisit When: A feature needs a richer state machine package or command model that preserves these invariants with stronger checks.

## Decision 008 - Frontend Runtime Scaling Contracts

- Decision: Centralize navigation, workspace scope, realtime ordering, cache policy, permission UX, tracing, pagination and feature capabilities in shared app/runtime contracts before feature growth.
- Alternatives: Let each feature own route strings, cache, realtime merge rules, flag reads and permission state locally.
- Rationale: Social Monitor is workspace-scoped, async-heavy and likely realtime. Local one-off rules would create stale workspace data, broken deep links, duplicate realtime events, hidden feature flags and untraceable frontend failures.
- Consequences: App composition registers typed `FeatureRouteContract` values; shared kernel owns framework-neutral primitives; features reject stale scoped data; cache is in-memory by default; flags fail closed; logs use correlation/action/screen ids and redacted fields.
- Required Evidence: Shared-kernel tests for runtime primitives and frontend architecture tests that block raw route paths in features, direct env flag reads, persistent cache packages, product console logging and realtime streams without order guards.
- Revisit When: Backend contracts introduce a stronger platform route/capability/realtime schema that should replace these local primitives.

## Decision 009 - Frontend Pre-Scale Playbooks

- Decision: Keep frontend UX architecture, design-system roadmap, state recipes, API contract rules, testing strategy, observability provider decision and security/privacy policy in `apps/frontend/docs` before growing real features.
- Alternatives: Let each feature discover these decisions while implementing screens, stores and mappers.
- Rationale: This app will be web-first but mobile-ready, workspace-scoped, async-heavy and provider-data-heavy. Consistent playbooks prevent private UI copies, ad hoc stores, API mapper drift, weak test coverage and unsafe telemetry.
- Consequences: Frontend agents must read the playbook index before substantial feature growth. New feature scaffolds link to it. Architecture and agent-quality checks keep the playbooks discoverable.
- Required Evidence: `apps/frontend/docs/README.md`, the seven playbook files and frontend architecture/agent-quality checks.
- Revisit When: Real feature implementation proves a playbook rule too weak or too heavy and a stronger pattern is ready.

## Decision 010 - Generated API Uses OpenAPI Retrofit Boundary

- Decision: Use `openapi_retrofit_generator` with `Dio`/`Retrofit` inside `apps/frontend/packages/generated_api` as the default Flutter REST client generation strategy.
- Alternatives: Handwritten feature-local REST clients, official OpenAPI Generator `dart-dio`, `swagger_dart_code_generator` with Chopper, or one handwritten app-wide API service.
- Rationale: Frontend features need contract freshness without leaking transport details. `Dio` is a strong Dart HTTP client, Retrofit declarations are readable, and keeping both inside `generated_api` preserves Clean Architecture dependency direction.
- Consequences: Feature use cases depend on feature-owned repositories/gateways, not generated clients. Feature infrastructure imports `social_monitor_generated_api` only in anti-corruption, mapper, api-client or data-source folders. App and feature packages must not depend on or import `dio`, `retrofit`, `retrofit_generator` or `openapi_retrofit_generator` directly.
- Boundary: `generated_api` is a contract-wide transport package, not a feature package. It may contain many generated endpoint declarations, but it must not own product decisions, domain invariants, use-case interfaces, UI state, endpoint-specific mapping policy or cross-context business facades.
- Required Evidence: `apps/frontend/docs/frontend-api-contract-playbook.md`, generated-api package tests, mapper tests for affected endpoints and `apps/frontend/app/test/architecture/frontend_architecture_boundaries_test.dart`.
- Revisit When: The generator cannot reliably handle the project OpenAPI contract, produces unstable generated output, blocks unknown enum behavior, or the package becomes unmaintained. Replacement stays behind `packages/generated_api`.
