# Frontend Agent Rules

This file is the frontend entrypoint for agents working under `apps/frontend`.
Read it before changing frontend code, then read the nearest feature or package rules.

## Required Reading

- `../../AGENTS.md` - root repository rules and hard stops.
- `../../CLAUDE.md` - repository quality gates and prohibited real-project agent flows.
- `../../.claude/rules/ddd-clean-architecture-folders.md` - canonical feature scaffold, DDD and Clean Architecture standard.
- `../../.claude/rules/flutter-frontend-quality.md` - Flutter frontend quality, responsive and package-boundary rules.
- `../../.claude/rules/flutter-clean-disk-deep-lessons.md` - failure modes from `clean_disk`.
- `docs/README.md` - frontend UX, design-system, state, API, testing, observability and privacy playbooks.

## Feature Architecture

- Every feature package is a bounded context.
- Create new feature packages only with `npm run frontend:create-feature -- <bounded_context> "<Title>" "<Purpose>"`.
- Read `features/<feature>/AGENTS.md` before editing a feature.
- Every feature exposes a route entrypoint from `presentation/routes` that wraps the feature in `ModuleScope`.
- Every feature keeps module wiring in `presentation/composition`; `ModuleProvider.of` is allowed only in the module host.
- Features use DDD layers: `domain`, `application`, `infrastructure`, `presentation`.
- Dart files under `features/<feature>/lib/src` must live inside a layer and tactical subfolder.
- Do not create `ports/` or `adapters/` folders in frontend features.

## Package Boundaries

- `app` owns routing, composition root and feature wiring.
- `app` imports feature public barrels only, never feature `src` internals.
- `design_system` owns product UI wrappers, headless integration, tokens and responsive primitives.
- `shared_kernel` stays framework-neutral and must not import Flutter, routing, MobX, generated API, design system or feature packages.
- `generated_api` stays an outer API boundary and must not import Flutter, app, design system or feature packages.
- `generated_api` owns OpenAPI generated REST clients, `Dio`, `Retrofit` and `openapi_retrofit_generator` configuration. App and feature packages must not depend on or import those packages directly.
- Feature packages import `design_system`, not raw `headless`, `headless_adaptive` or third-party UI primitives.
- Feature stores use typed shared async state, typed failures and stale-result guards for async/realtime flows.
- Feature use cases return `Result` for expected failures and expose risky actions through explicit action intent/policy state.
- Feature DTO mapping stays in infrastructure mappers or anti-corruption folders with focused mapper tests.
- Localization is presentation-only; domain, application and infrastructure must not import localization APIs.
- Routes are typed app-shell contracts. Features do not own raw route strings, route parsing or redirect policy.
- Workspace scope is first-class. API requests, cache entries and realtime events must carry scope and reject stale workspace data.
- Realtime input must use event id, schema version, sequence/cursor, dedupe, stale discard and resync-required state.
- Frontend cache is in-memory by default. Persistence requires an ADR and a focused architecture-test exception.
- Capabilities and rollout flags are app composition state. Features do not read `fromEnvironment`, dotenv or process environment.
- Logs and reports use correlation/action/screen ids plus redacted fields, never raw provider payloads.
- Do not add `flutter_modular` or `get_it` without an ADR and architecture test exception.
- Use `modularity_flutter` only for feature route/module composition, not domain/application/infrastructure or ordinary widgets.
- All frontend packages inherit strict analyzer options from `apps/frontend/analysis_options.yaml`.

## Local Done Checks

Run the smallest checks that prove the frontend change:

- Full frontend platform gate: `npm run check:frontend`.
- Architecture/rule change: `fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart`.
- Dart source change: `fvm flutter analyze`.
- App shell change: `fvm flutter test app`.
- Design-system/shared-kernel/generated-api change: run the affected package tests plus the architecture test.

## Live Dev Runtime

- When the user is viewing `http://127.0.0.1:53217`, apply ordinary Dart UI changes with `npm run frontend:hot-reload`.
- Use `npm run frontend:hot-restart` only when app startup, `initState`, web assets or pubspec changes require a restart.
- During multi-agent frontend work, prefer leaving `npm run frontend:watch-hot-reload` running so Dart changes trigger safe Flutter hot reload and startup/web/package changes trigger restart automatically.
- Do not launch duplicate frontend instances on nearby ports unless the user explicitly asks for a separate instance.

Do not run agent launch, provisioning, terminal-runtime, task-assignment or smoke-flow checks on this real project.
