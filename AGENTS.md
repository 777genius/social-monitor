# Social Monitor Agent Rules

This file is the root entrypoint for every agent working in this repository.
Read it before changing code, then load the linked rule files for the area you touch.
When two rules overlap, the stricter rule wins.

## Mandatory Rule Index

Read these before any code change:

- `CLAUDE.md` - repository-wide quality bar, prohibited flows and done gates.
- `.claude/rules/quality-architecture.md` - backend/API Clean Architecture, DDD boundaries and release gates.
- `.claude/rules/ddd-clean-architecture-folders.md` - canonical frontend feature scaffold, DDD folders and Clean Architecture dependency direction.
- `.claude/rules/flutter-frontend-quality.md` - Flutter frontend architecture, responsive rules, design-system rules and executable frontend gates.
- `.claude/rules/flutter-clean-disk-deep-lessons.md` - concrete failure modes from `clean_disk` that must not be repeated here.
- `apps/frontend/AGENTS.md` - frontend package roles, app/design-system/shared-kernel boundaries and local done checks.
- `apps/frontend/docs/README.md` - frontend UX, design-system, state, API, testing, observability and privacy playbooks.
- `docs/iterations/04-mobile-app/15-change-control.md` - change-control bans for the mobile/frontend iteration.
- `docs/iterations/04-mobile-app/18-decision-log.md` - recorded architecture decisions for the mobile/frontend iteration.

## Hard Stops

- Do not run agent launch, provisioning, terminal-runtime, task-assignment or smoke-flow checks on real user projects. Use sandbox/test projects only.
- Do not weaken architecture tests, hooks or dependency-direction gates without replacing them with equal or stronger executable checks.
- Do not add behavior to human-written Dart files over 500 lines. Split first.
- Do not let any human-written Dart file exceed 600 lines.
- Do not add raw `headless`, `headless_adaptive`, generated API clients or heavy renderer packages directly to feature widgets.
- Do not add `dio`, `retrofit`, `retrofit_generator` or `openapi_retrofit_generator` to frontend app or feature packages. The frontend REST generator and HTTP transport implementation live only in `apps/frontend/packages/generated_api` unless an ADR and architecture-test exception approve a replacement.
- Do not model frontend async state as loose `isLoading`/`error` fields. Use shared typed state and failures.
- Do not let async stores apply stale results after workspace, query, filter, route or selection changes.
- Do not add raw route path strings, route parsing or deep-link policy inside frontend features. App composition owns typed `FeatureRouteContract` registration.
- Do not persist frontend cache, credentials or provider payloads from a feature without an ADR and architecture-test exception.
- Do not read feature flags from environment variables inside features. Capabilities are app composition state and fail closed.
- Do not handle realtime streams in a feature without cursor, schema version, sequence, dedupe and workspace-scope guarding.
- Do not log raw frontend payloads. Use correlation/action/screen ids and redacted fields.
- Do not put raw provider payloads, access tokens, API keys or realistic secrets in frontend tests, logs, screenshots or fixtures.
- Do not reintroduce a local `apps/frontend/packages/headless_adaptive` package directory. The source of truth is `https://github.com/777genius/flutter_headless.git`.
- Do not create frontend feature packages manually. Use `npm run frontend:create-feature -- <bounded_context> "<Title>" "<Purpose>"`.
- Do not add `flutter_modular` or `get_it` to frontend packages without an ADR and an equal-or-stronger architecture test.
- Do not import `modularity_flutter` outside frontend app root or feature `presentation/routes` and `presentation/composition`.
- Do not call `ModuleProvider.of` outside `*_feature_module_host.dart`.
- Do not export feature pages directly; public feature barrels export route entrypoints only.
- Do not create default frontend feature folders named `ports/` or `adapters/`. Use canonical DDD folders and product-language names.
- Read the local `apps/frontend/features/<feature>/AGENTS.md` before editing a frontend feature.
- Read `apps/frontend/AGENTS.md` before editing frontend app, package or feature code.
- Do not create broad frontend dumps such as `models.dart`, `dtos.dart`, `mapper.dart`, `widgets.dart`, `helpers.dart`, `utils.dart` or generic `manager.dart`.

## Frontend Clean-Disk Guardrails

The project must avoid the exact failure mode seen in `clean_disk`:

- route pages compose sections only;
- route pages must not become private widget libraries;
- stores are workflow-scoped presentation controllers, not application services;
- DTOs and mappers split by endpoint or aggregate family;
- domain models split by product language, not collected into a single catalog;
- complex design-system primitives become component folders;
- tests split by workflow and keep fixtures/builders in support files.

The executable frontend guard is:

```sh
cd apps/frontend
fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart
```

Keep this test green before claiming frontend architecture work is done.

## Before Claiming Done

Run the smallest checks that prove the changed surface:

- frontend Dart or architecture change: from `apps/frontend`, run `fvm flutter analyze` and `fvm flutter test app/test/architecture/frontend_architecture_boundaries_test.dart`;
- full frontend platform change: run `npm run check:frontend`;
- frontend app/design-system change: also run the affected app or package tests;
- frontend shared-kernel/generated-client change: also run `fvm dart test packages/shared_kernel packages/generated_api`;
- backend architecture/runtime/API/security change: follow the gates in `CLAUDE.md`;
- rule/hook change: run the relevant rule or hook checks if available.

If a required check cannot run, state the exact blocker and do not claim full verification.
