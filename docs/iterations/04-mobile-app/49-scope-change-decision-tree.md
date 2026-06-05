# Iteration 04 - Scope Change Decision Tree

## Decision Goal
Prevent mobile scope changes from bypassing feature-scoped Clean Architecture.

## Accept Now If
- Change improves core loop usability.
- Change clarifies DTO-to-domain mapping.
- Change covers missing loading, empty, error, stale or offline state.

## Defer If
- Change adds visual polish before core loop completion.
- Change adds non-critical settings.
- Change adds deep offline-first behavior beyond MVP.

## Escalate To ADR If
- Change alters feature boundaries.
- Change changes generated client integration strategy.
- Change changes state ownership or navigation architecture.

## Block If
- Change uses DTOs as domain models.
- Change puts business rules in widgets or stores.
- Change hides source, feed or summary failures.

## Required Record
- Feature slice impact.
- Store impact.
- API contract impact.
- UI state test impact.
