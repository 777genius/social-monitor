# Iteration 05 - Risk-Based Priority

## Priority 1 - Reconnect And Resync

- Risk: Mobile misses scan/summary status permanently.
- Do First: Define latest-state snapshot and resync flow.
- Do Not Defer: Offline/reconnect scenario.

## Priority 2 - Channel Authorization

- Risk: Realtime leaks tenant/workspace data.
- Do First: Match REST authorization strength.
- Do Not Defer: Permission revocation case.

## Priority 3 - Notification Idempotency

- Risk: Duplicate events create noisy user experience.
- Do First: Idempotency key per source event and notification type.

## Priority 4 - Delivery Failure Visibility

- Risk: External delivery failures are invisible.
- Do First: Delivery logs and retry status.
