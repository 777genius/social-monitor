# Iteration 05 - Sprint Review Demo Script

## Review Goal
Prove that realtime updates and notifications are authorized, recoverable and consistent with REST state.

## Demo Flow
1. Connect authenticated WebSocket client.
2. Subscribe to tenant/topic channel.
3. Trigger scan and summary events.
4. Show mobile UI updates.
5. Disconnect, miss events and resync.
6. Demonstrate duplicate notification prevention.

## Evidence To Show
- Realtime events are versioned and tenant-scoped.
- Channel authorization matches REST permissions.
- Resync snapshot restores missed state.
- Notification idempotency keys are persisted.

## Edge Cases To Exercise
- Token expires during WebSocket session.
- User loses access while subscribed.
- Duplicate event is delivered.
- Events arrive while mobile screen switches topic.

## Review Questions
- Does realtime improve the MVP loop without becoming required for correctness?
- Can mobile recover purely through resync?
- Are delivery failures visible to support?

## Accept Progress If
- Unauthorized subscriptions are blocked.
- Reconnect/resync works.
- Duplicate notifications do not appear.
