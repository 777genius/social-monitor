# Iteration 04 - Acceptance Test Plan

## Acceptance Scenarios

1. App starts with configured environment.
2. Generated REST client is wrapped by feature infrastructure adapters.
3. Topic creation screen creates a topic.
4. Source binding screen configures allowed source and interval.
5. Feed screen shows items, filters and provenance.
6. Summary screen shows latest summary and citations.
7. Citation tap opens source item detail.
8. MobX stores are testable without widgets.
9. Empty, loading, error, stale and offline states render for each core feature.
10. Full mobile MVP loop completes without developer intervention.

## Negative Scenarios

1. Backend returns provider quota error and UI shows actionable source state.
2. Token expires while app is offline.
3. Summary failed while feed is healthy.
4. Citation item is unavailable.
5. Source capability does not support requested binding.

## Regression Checks

- Generated DTOs do not leak into domain models.
- Feature infrastructure is not imported across features.
- Headless components remain the basis for UI controls.
- API error mapping remains consistent.

## Pass Criteria

Mobile is accepted when a beta user can complete topic -> source binding -> feed -> cited summary and understand all major failure states.
