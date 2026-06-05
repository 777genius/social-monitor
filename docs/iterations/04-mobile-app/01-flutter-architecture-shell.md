# Iteration 04 / Phase 01 - Flutter Architecture Shell

## Objective

Create Flutter app shell using feature-scoped Clean Architecture and Feature-Sliced Design.

## Steps

1. Create Flutter app and packages: design_system, shared_kernel, generated_api, features.
2. Add feature slices: auth, topics, sources, feed, summaries, settings.
3. Add MobX store conventions.
4. Add dependency injection/composition root.
5. Add generated REST client wrapper.
6. Add route shell and tenant context.
7. Add `flutter_headless` only after repository review and pin it to an approved commit/tag/version.
8. Add feature boundary rules: features may depend on shared_kernel/design_system/generated_api adapters, but not on other feature internals.
9. Add API Problem Details mapper to domain-safe failures.
10. Add request cancellation policy for tenant/workspace switch and logout.

## Feature Slice Contract

Each feature slice must contain only the layers it needs:

- `domain`: entities, value objects, feature errors and policy-free invariants.
- `application`: use cases, ports and orchestration.
- `infrastructure`: generated REST client adapters, DTO mappers, cache adapters.
- `presentation`: MobX stores, view models and widgets.

Rules:

- Generated DTOs stop in infrastructure.
- MobX stores call use cases, not generated clients.
- Widgets observe store state and dispatch store actions only.
- Cross-feature communication goes through public application/domain contracts or shared_kernel, not private imports.

## Folder Baseline

```text
lib/
  app/
    composition/
    routing/
    session/
  shared/
    kernel/
    failures/
    recovery/
  design_system/
  generated_api/
  features/
    topics/
      domain/
      application/
      infrastructure/
      presentation/
    sources/
    feed/
    summaries/
```

Per-feature contracts:

1. `domain` defines feature entities/value objects/failures only.
2. `application` defines use cases and repository ports.
3. `infrastructure` implements ports with generated REST/WebSocket/cache adapters.
4. `presentation` defines MobX stores and immutable view models.
5. UI widgets can live under presentation or a feature-local UI folder, but must not contain business rules.

## Generated Client Boundary

1. Generated API client is infrastructure.
2. Generated DTOs are mapped to domain/application DTOs before store state.
3. Unknown enum values map to `unknown(rawValue)` infrastructure-safe value or typed fallback failure.
4. Problem Details maps to typed `AppFailure` with `RecoveryAction`.
5. API pagination maps to domain cursor objects, not raw strings in widgets.
6. OpenAPI regeneration must be deterministic and checked in CI.

## Request Lifecycle Rules

1. Every request carries active workspace context.
2. Logout cancels all in-flight authenticated requests.
3. Workspace switch cancels old requests, clears old stores or marks them invalid, then reloads new workspace.
4. A late response from an old workspace must be ignored by store guards.
5. WebSocket events are hints; stores resync through REST before showing critical state changes.
6. Retry actions are idempotent in store methods.

## Mobile MVP Complexity Guardrails

1. MobX stores orchestrate presentation state only; use cases decide business behavior.
2. Do not create a global app store for feature data. Global state is limited to session, workspace context, routing shell and app-level connectivity.
3. Feature repositories expose domain-safe methods; they do not return generated DTOs.
4. Offline MVP is read-cache first. Offline writes are disabled unless backend idempotency and conflict rules exist for that use case.
5. Realtime updates enter through feature application/store ports and trigger REST/read-model resync for correctness.
6. `flutter_headless` is wrapped by `design_system`; feature widgets do not import it directly.
7. Duplicate small mappers per feature are acceptable if sharing them would couple feature internals.
8. A new feature slice must prove user-visible MVP value or be recorded as post-MVP.

## Edge Cases

- Generated DTO leaks into domain.
- Store directly calls HTTP client.
- Feature imports another feature internals.
- Tenant switch leaves stale cache.
- In-flight request completes after tenant switch.
- Backend adds nullable field that breaks domain mapper assumptions.
- Problem Details code has no mobile recovery mapping.
- Generated client changes method names after OpenAPI update.
- WebSocket reconnect replays status for an inactive workspace.
- Store is disposed while async action is still running.
- Cache returns valid shape but old contract version.
- Global store starts owning feed, summary or source state.
- Offline save appears enabled but backend cannot resolve conflicts.
- A UI component bypasses `design_system` and imports `flutter_headless` directly.
- Realtime event mutates widget state without feature store/use-case path.

## Pay Attention

- Domain models are separate from DTOs.
- Stores expose UI state, not raw API responses.
- Feature modules should be independently testable.
- Third-party UI primitives are framework dependencies; feature domain/application layers must not import them.
- `flutter_headless` is used through `design_system`; feature code must not import it directly.
- Do not let route parameters become authorization checks; backend and repository ports still enforce workspace context.
- Keep app shell thin; feature complexity belongs in feature slices.
- Prefer explicit state classes over boolean flag combinations that become impossible to reason about.

## Acceptance Criteria

- App boots to authenticated/dev shell.
- Features compile with clean imports.
- One generated client adapter works.
- Store unit test passes.
- `flutter_headless` dependency version/commit is recorded with owner and review date.
- Feature import-boundary test or lint rule prevents private cross-feature imports.
- Problem Details mapper has typed recovery behavior for core backend errors.
- Request cancellation and late-response guards are tested.
- Generated DTO boundary is proven by mapper/store tests.
- Global state is limited to session/workspace/routing/connectivity.
- Offline write actions are absent or backed by explicit idempotency/conflict evidence.
