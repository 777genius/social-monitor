# Canonical DDD Clean Architecture Feature Rules

Use DDD for feature meaning and Clean Architecture for dependency direction.
`port` and `adapter` are architectural roles, not default folder names.

## Decision

- A frontend feature package is a bounded context unless an architecture decision says otherwise.
- New frontend features must be created with `npm run frontend:create-feature -- <bounded_context> "<Title>" "<Purpose>"`.
- New frontend features use the canonical DDD scaffold by default, even when the first page is only a shell.
- Every feature exposes a route entrypoint from `presentation/routes` that wraps the feature in `ModuleScope`.
- Every feature keeps module wiring in `presentation/composition`; `ModuleProvider.of` is allowed only in the module host.
- Do not create default `ports/` and `adapters/` folders for new frontend feature slices.
- Every frontend feature folder must have its own `AGENTS.md` that links back to this standard.
- Dart files under `features/<bounded_context>/lib/src` must live inside a DDD layer and tactical subfolder.
- Existing backend `ports/` and `adapters/` folders are legacy structure and may stay until a deliberate migration.

## Canonical Bounded Context Shape

```text
features/<bounded_context>/
  AGENTS.md
  docs/
    ubiquitous_language.md
    context_map.md
  lib/social_monitor_<bounded_context>.dart
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

The scaffold creates the route entrypoint, module, module host, page, context map and ubiquitous-language notes. Add other tactical folders only when behavior needs them, but once a layer exists, Dart files go under tactical subfolders, not directly in the layer root.

## Required Scaffold Files

Every feature must have:

- `AGENTS.md`;
- `docs/ubiquitous_language.md`;
- `docs/context_map.md`;
- `lib/social_monitor_<bounded_context>.dart`;
- `lib/src/presentation/routes/<bounded_context>_feature_route.dart`;
- `lib/src/presentation/composition/<bounded_context>_feature_module.dart`;
- `lib/src/presentation/composition/<bounded_context>_feature_module_host.dart`;
- `lib/src/presentation/pages/<bounded_context>_feature_page.dart`.

The package barrel exports only the route entrypoint. The route entrypoint owns `ModuleScope`; the module host is the only place that may read `ModuleProvider.of`.

## Tactical DDD Rules

- Bounded context names are product concepts: `topics`, `sources`, `feed`, `summaries`, `auth`, `settings`.
- Every bounded context keeps a context map and ubiquitous language notes.
- Aggregates enforce consistency boundaries and own invariant methods.
- Entities have identity and lifecycle.
- Value objects are immutable and validate their own shape.
- Domain events describe business facts in past tense.
- Policies and specifications name business decisions explicitly.
- Repositories represent domain collections, not generic data access.
- Domain services exist only when behavior does not naturally belong to an aggregate/entity/value object.
- Application use cases coordinate commands/queries and return typed results; they do not contain hidden UI or infrastructure behavior.
- Infrastructure is an anti-corruption layer for generated API clients, DTOs, persistence, realtime and external SDKs.
- Presentation route files create `ModuleScope`; composition files wire feature dependencies; pages/components/stores stay free of module lookups.
- Presentation stores orchestrate UI state only and call application use cases.
- Presentation stores use shared typed async state and stale-result guards for async/realtime flows.
- Risky, expensive, destructive or credential-affecting actions expose explicit action intent state with id, risk, disabled reason, confirmation policy and idempotency key.
- Generated API DTOs are translated in infrastructure mappers or anti-corruption folders before reaching application, domain, stores or widgets.
- Localization is presentation-only; domain, application and infrastructure use stable codes and typed state, not localized copy.

## Feature AGENTS.md Template

Each feature `AGENTS.md` must state:

- current mode: canonical modular DDD bounded context;
- bounded context purpose in product language;
- links to root `AGENTS.md`, this file, `flutter-frontend-quality.md` and frontend playbooks;
- required scaffold files;
- growth triggers for domain/application/infrastructure additions;
- local done checks.

Agents must read the feature `AGENTS.md` before editing that feature.

## How To Add A Feature

1. Run `npm run frontend:create-feature -- <bounded_context> "<Title>" "<Purpose>"` from the repository root.
2. Add the generated package to `apps/frontend/app/pubspec.yaml` only when the app shell routes to it.
3. Add the route descriptor in the app composition root.
4. Run `cd apps/frontend && fvm flutter pub get`.
5. Run the frontend architecture test before claiming done.

Do not hand-create a feature package. The scaffold is the source of truth because it writes local agent rules, route/module composition files and docs together.

## How To Grow A Feature

1. Update `docs/ubiquitous_language.md` before naming new domain concepts.
2. Update `docs/context_map.md` before talking to another bounded context.
3. Add only the tactical folders required by the current behavior.
4. Read the relevant frontend playbook before adding screens, stores, API mapping, telemetry or provider-data UI.
5. Put business invariants in `domain`, orchestration in `application`, external mapping in `infrastructure` and UI state in `presentation`.
6. Wire concrete implementations in `presentation/composition`, not pages, stores or domain code.
7. Guard async/realtime results with operation generation or workspace request guards before updating stores.
8. Add focused tests for the new use case, mapper, store, value object, aggregate or action policy.
9. Keep feature tests split by layer/workflow, with fixtures and builders in `test/support`.
10. Keep the package barrel narrow. Expose route entrypoints by default; expose additional public contracts only after architecture review.

## Runtime Contract Placement

- `app` owns route registration, `FeatureRouteContract`, deep-link behavior, redirects and feature capability state.
- `shared_kernel` owns framework-neutral primitives for route contracts, workspace scope, cache policy, pagination, realtime envelopes, permission UX state, tracing and rollout capabilities.
- `application` owns use-case commands/queries/results and returns typed failure or access states.
- `infrastructure` owns API clients, DTO mapping, cache/realtime implementations and schema-version translation.
- `presentation/stores` may hold workflow state, but must reject stale workspace, route, filter, selection and realtime results before mutating state.

Do not put raw route paths, feature flag reads, persistent cache setup, realtime ordering logic or raw provider logging into feature widgets.

## Folder Selection Guide

Use these destinations:

- `domain/aggregates` for consistency boundaries that change together.
- `domain/entities` for identified domain objects with lifecycle.
- `domain/value_objects` for immutable typed values, ids, ranges, names and statuses.
- `domain/domain_events` for business facts that already happened.
- `domain/policies` for named business decisions.
- `domain/specifications` for composable rules and predicates.
- `domain/repositories` for domain collection contracts.
- `domain/domain_services` for domain behavior that does not belong to one aggregate.
- `application/use_cases` for user/application workflows.
- `application/commands` for write inputs.
- `application/queries` for read inputs.
- `application/handlers` for command/query orchestration when it helps clarity.
- `application/results` for typed use-case outputs.
- `application/contracts` for outbound abstractions owned by the use case.
- `infrastructure/api_clients` for generated or hand-written API clients.
- `infrastructure/mappers` for DTO/domain mapping.
- `infrastructure/anti_corruption` for translation from backend/provider language into this context language.
- `infrastructure/repositories` for implementations of repository contracts.
- `infrastructure/data_sources` for direct storage/network source wrappers.
- `presentation/routes` for route entrypoints that apply `ModuleScope`.
- `presentation/composition` for feature modules, module hosts and dependency wiring.
- `presentation/pages` for screen composition.
- `presentation/stores` for MobX UI workflow state.
- `presentation/view_models` for display-ready state.
- `presentation/components` for feature-private widgets.
- `presentation/workflows` for multi-step UI flows.
- `presentation/formatters` for UI-only formatting.

If none of these names fit, stop and name the product concept before adding code.

## Naming Rules

- Prefer `TopicRepository`, `SourceCatalog`, `FeedGateway`, `SummaryJobClient` or `WorkspaceSessionStore` over `TopicPort` or `TopicAdapter`.
- Use `contracts/` only for application-owned outbound abstractions.
- Use `repositories/` when the abstraction represents domain collection semantics.
- Use `api/`, `api_clients/`, `persistence/`, `realtime/`, `storage/`, `mappers`, `repositories`, `data_sources` and `anti_corruption` for infrastructure implementation details.
- Do not create catch-all folders or files named `ports`, `adapters`, `models`, `widgets`, `helpers`, `utils` or generic `manager`.

## Dependency Direction

- `domain` owns business language and invariants.
- `application` owns use cases, commands, queries, workflow results and application contracts.
- `infrastructure` implements application/domain contracts and maps external DTOs.
- `presentation` owns routes, composition, screens, stores, view models and UI state.
- Feature composition files may import application, infrastructure and domain for wiring only.
- Feature package dependencies may include MobX for presentation state, `generated_api` for infrastructure adapters and `modularity_flutter` for route/module composition.
- Do not add routing, raw headless packages, `flutter_modular`, `get_it` or other feature packages to a feature pubspec.

Allowed direction:

```text
presentation pages/components/stores -> application -> domain
infrastructure -> application/domain contracts
presentation/composition -> application/infrastructure/domain for wiring only
app composition -> feature public route entrypoints
```

Forbidden direction:

```text
domain -> application/infrastructure/presentation
application -> infrastructure/presentation/generated API
presentation pages/components/stores -> generated API/infrastructure implementation
feature -> another feature src internals
```

## Repository And Gateway Placement

- Put repository/gateway abstractions in `domain` when they express domain collection semantics.
- Put repository/gateway abstractions in `application/contracts` when they exist only to support a use case.
- Put generated client wrappers, DTO mapping, cache and SDK code in `infrastructure`.
- Put wiring in `presentation/composition` or app composition, not inside widgets, stores or domain services.

## Backend Note

The backend already has many `ports/` and `adapters/` folders. Do not use that as a template for the Flutter frontend.
For backend changes, keep existing imports green, but prefer domain-language names for new contracts and implementation files when local conventions allow it.
