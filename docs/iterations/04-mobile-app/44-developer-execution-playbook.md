# Iteration 04 - Developer Execution Playbook

## Reading Order
1. Read `00-iteration-overview.md`.
2. Read `35-first-sprint-ticket-cut.md`.
3. Read `38-architecture-compliance-audit.md`.
4. Read `39-contract-dependency-checklist.md`.
5. Read `41-test-fixtures-and-scenarios.md`.

## PR Slicing
- PR 1: Flutter shell and dependency registration.
- PR 2: generated client wrapper and DTO mappers.
- PR 3: topic feature slice.
- PR 4: source binding feature slice.
- PR 5: feed and summary feature slice.
- PR 6: UI state coverage and store tests.

## Checks Before PR
- DTOs stay in infrastructure.
- MobX stores orchestrate presentation only.
- Feature use cases depend on domain/application contracts and repositories.
- Loading, empty, error, stale and offline states are testable.
- Required headless component usage is preserved.

## Evidence To Attach
- Mapper/store test output.
- UI state screenshot or golden scenario for changed screen.
- Generated client diff when API contract changes.
- `flutter_headless` wrapper/design_system evidence when UI primitives change.
- Import-boundary proof for feature slices.

## Architecture Guardrails
- Widgets render, stores orchestrate, use cases decide.
- Backend errors become domain-safe UI states.
- Realtime readiness must not bypass feature stores.

## Escalate When
- Contract changes break generated clients.
- UI needs a backend field not guaranteed by contract.
- A store starts owning business rules.
