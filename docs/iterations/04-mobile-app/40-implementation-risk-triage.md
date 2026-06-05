# Iteration 04 - Implementation Risk Triage

## Triage Goal
Detect mobile architecture and UX risks before realtime and beta work depend on unstable feature slices.

## Critical Risks
- Generated DTOs become domain models.
- MobX stores own business rules.
- Failure states are hidden or merged into generic errors.
- Feature boundaries are bypassed for speed.

## Early Warning Signals
- Widgets call generated clients directly.
- Same mapping logic appears in multiple features.
- Loading/empty/error/stale/offline states are not testable.
- Citation UI assumes optional backend fields are always present.

## Owners
- Flutter lead owns feature boundaries.
- API owner owns generated client compatibility.
- Product owner owns user-facing error/state wording.
- QA owner owns store and UI state tests.

## Mitigations
- Keep DTO mapping in infrastructure adapters.
- Test stores separately from widgets.
- Define domain-safe error models.
- Build citation and source-failure states before polish.

## Stop-Work Triggers
- DTOs cross into domain layer.
- Store tests cannot simulate backend failure states.
- Core MVP loop requires manual app restart or hidden state reset.

## MVP Risk Cutline
- Fix now: DTO/domain boundary, store behavior, core flow, and visible error/stale/offline states.
- Carry with owner: secondary settings and minor visual polish.
- Defer: advanced analytics UI and non-core screens.
