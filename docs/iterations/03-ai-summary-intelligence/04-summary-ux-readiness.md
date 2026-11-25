# Iteration 03 / Phase 04 - Summary UX Readiness

## Objective

Prepare summaries for mobile/UI consumption.

## Steps

1. Add summary list/detail read models.
2. Add summary status timeline.
3. Add confidence/uncertainty fields.
4. Add citation display contract.
5. Add regenerate command.
6. Add summary failed/review_required states.
7. Add WebSocket event `summary.ready`.

## Edge Cases

- Summary completes while user is offline.
- Summary was generated from stale source window.
- User deletes topic after summary requested.
- Citation item is no longer visible.

## Pay Attention

- REST read model is truth; WS is notification.
- UI should not display failed raw AI response.
- Regeneration must be idempotent/cost-gated.

## Acceptance Criteria

- Summary appears in REST and WS.
- Failed summary has useful reason.
- Regenerate respects quotas.
- Citation links resolve or show unavailable state.
