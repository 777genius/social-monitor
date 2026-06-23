# Iteration 04 - Operational Runbook

## Daily Workflow

1. Regenerate API client when OpenAPI changes.
2. Run store tests after feature logic changes.
3. Verify DTO mapping stays in infrastructure.
4. Check loading, empty, error, stale and offline states for touched screens.
5. Run full MVP mobile flow after backend contract changes.
6. Record UX gaps that are actually backend/source status gaps.

## Review Cadence

- Feature boundary review after shell setup.
- Headless component review before feature UI scale-up.
- Error-state review before beta.
- Full-flow review before realtime integration.

## Blockers

- Backend contract missing required state.
- Generated DTO leaks into domain.
- Store owns business invariant.
- Required headless component cannot represent needed state.
- User cannot understand scan/source/summary failure.

## Handoff Notes

- Hand off missing backend states to API lane.
- Hand off realtime requirements to delivery lane.
- Hand off confusing UX states to support/onboarding lane.
- Hand off source capability display requirements to source catalog lane.

## Support And Ops Impact

- UI must expose actionable failure states for support screenshots.
- Stale/offline indicators reduce false bug reports.
- Source limitations must be visible before users assume the system is broken.
