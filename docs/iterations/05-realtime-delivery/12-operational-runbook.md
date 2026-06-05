# Iteration 05 - Operational Runbook

## Daily Workflow

1. Verify WebSocket auth and channel authorization.
2. Emit test scan/feed/summary events.
3. Test reconnect and resync.
4. Check notification idempotency.
5. Inspect delivery logs for retry scenarios.
6. Confirm mobile displays realtime status correctly.

## Review Cadence

- Realtime contract review before gateway implementation.
- Authorization review before mobile integration.
- Notification review before digest jobs.
- Delivery log review before production hardening.

## Blockers

- Reconnect cannot recover missed events.
- Realtime auth differs from REST auth.
- Duplicate events create duplicate notifications.
- Delivery failures are invisible.
- External delivery expands MVP scope.

## Handoff Notes

- Hand off realtime status events to Flutter lane.
- Hand off delivery logs to ops lane.
- Hand off notification preferences to beta/support lane.
- Hand off missed-event recovery rules to API lane.

## Support And Ops Impact

- Support needs to know whether status is delayed, failed or missed by reconnect.
- Delivery logs must show attempts, retries and final state.
- Notification duplicates are user-visible and should be treated as quality incidents.
