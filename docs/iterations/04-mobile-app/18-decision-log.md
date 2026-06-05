# Iteration 04 - Decision Log

## Decision 001 - Feature-Scoped Clean Architecture

- Decision: Flutter features own domain, application, infrastructure and presentation layers.
- Alternatives: Global layered folders only.
- Rationale: Feature ownership stays clear as app grows.
- Consequences: More per-feature structure, less cross-feature coupling.
- Revisit When: Shared domain concepts require explicit platform package.

## Decision 002 - MobX Stores As Presentation Orchestrators

- Decision: MobX stores orchestrate UI state and use cases only.
- Alternatives: Put business rules and API calls directly in stores.
- Rationale: Testability and Clean Architecture boundaries.
- Consequences: Requires repositories/use cases per feature.
- Revisit When: A feature is truly view-only and has no domain behavior.

## Decision 003 - `flutter_headless` As Wrapped UI Primitive Source

- Decision: Use `flutter_headless` through a product `design_system` wrapper, not through direct feature imports.
- Alternatives: Direct package imports in every feature, custom widgets only, another UI package.
- Rationale: Component behavior stays consistent while product visuals, accessibility defaults and responsive constraints remain owned by the app.
- Consequences: The design system must own wrappers, tests and version/commit review.
- Required Evidence: Approved repository review, pinned commit/tag/version and design_system wrapper tests.
- Revisit When: Required controls are missing, package API becomes unstable or accessibility/responsiveness cannot be guaranteed through wrappers.
