# Iteration 05 - Acceptance Test Plan

## Acceptance Scenarios

1. WebSocket connection authenticates user.
2. User can join only authorized workspace/topic channels.
3. Scan status event updates mobile UI.
4. Feed update event updates mobile UI.
5. Summary status event updates mobile UI.
6. Reconnect triggers resync and recovers missed state.
7. Duplicate source event creates one notification.
8. Notification read/unread state persists.
9. Digest job respects preferences.
10. Delivery log records retryable failure.

## Negative Scenarios

1. User loses workspace access while connected.
2. Topic is deleted before event delivery.
3. Webhook endpoint fails repeatedly.
4. Notification preference changes while delivery is queued.
5. Mobile resumes after long offline period.

## Regression Checks

- WebSocket DTOs remain versioned.
- Realtime gateway does not own domain state.
- Notification idempotency keys remain stable.
- REST resync endpoint remains compatible with mobile.

## Pass Criteria

Realtime delivery is accepted when mobile reliably receives and recovers scan/summary/feed status without manual refresh.
