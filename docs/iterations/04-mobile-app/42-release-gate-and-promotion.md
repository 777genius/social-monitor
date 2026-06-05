# Iteration 04 - Release Gate And Promotion

## Promotion Goal
Approve movement from core mobile MVP into realtime delivery.

## Required Evidence
- Flutter app shell runs.
- Generated client is isolated behind adapters.
- Feature slices preserve domain/application/infrastructure/presentation boundaries.
- Topic, source binding, feed and summary flows work.
- Loading, empty, error, stale and offline states are covered.

## Promotion Checks
- DTOs do not cross into feature domain.
- MobX stores do not own business rules.
- Citation UI handles missing or stale targets.
- Backend errors map to user-visible states.

## Hold Conditions
- Core loop requires manual workaround.
- Stores call generated clients directly.
- Feature boundary is bypassed for speed.
- Realtime would need to mutate widgets directly.

## Rollback Or Rework
- Rework DTO mapping before realtime uses stores.
- Rework feature boundaries before adding live updates.
- Rework failure states before beta hardening.

## Approval
Mobile may promote only when realtime can integrate through feature stores and domain-safe models.
