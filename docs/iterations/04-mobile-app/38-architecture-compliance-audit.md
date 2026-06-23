# Iteration 04 - Architecture Compliance Audit

## Audit Goal
Verify that Flutter implementation follows feature-scoped Clean Architecture, DDD folder names, MobX presentation stores and required headless component usage.

## Required Checks
- Feature folders contain domain, application, infrastructure and presentation boundaries.
- Generated DTOs stay in infrastructure.
- MobX stores orchestrate UI state and do not own business rules.
- `flutter_headless` is pinned and wrapped by design_system before feature code depends on it.
- UI covers loading, empty, error, stale and offline states.
- Backend failures are represented through domain-safe error models.

## Critical Violations
- DTOs are used as domain entities.
- Stores call generated clients directly.
- Business rules are embedded in widgets.
- Source or summary failure states are hidden from the user.

## SOLID And Clean Architecture Focus
- Single responsibility: widgets render, stores orchestrate, use cases decide.
- Dependency inversion: feature use cases depend on contracts/repositories.
- Interface segregation: mobile contracts expose feature needs, not whole backend clients.

## Evidence Required
- Feature folder examples.
- DTO/domain mapper tests.
- MobX store tests.
- Design system wrapper tests proving headless components do not leak into feature domain/application code.
- UI state screenshots or golden scenarios.
- Generated client integration proof.

## Closure Rule
Iteration 05 cannot start if realtime integration would need to bypass feature stores or domain-safe models.
