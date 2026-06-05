# Iteration 05 - First Sprint Ticket Cut

## Sprint Objective
Add realtime scan/feed/summary status, authorized WebSocket channels and idempotent notification semantics.

## Ticket 1 - Realtime Event DTOs
- Define event shapes for scan started/completed/failed, feed updated and summary ready.
- Acceptance: events are versioned, tenant-scoped and documented.
- Edge cases: event schema must tolerate missing optional fields and future versions.

## Ticket 2 - WebSocket Gateway
- Implement authenticated WebSocket gateway and tenant-aware subscriptions.
- Acceptance: unauthorized users cannot subscribe to another tenant's channels.
- Edge cases: token expiry, reconnect and access revoked while connected.

## Ticket 3 - Resync Snapshot
- Add REST snapshot endpoint or equivalent resync mechanism after reconnect.
- Acceptance: mobile can recover missed events without duplicate UI effects.
- Edge cases: events arrive while snapshot is loading.

## Ticket 4 - Notification Read Model
- Persist notification state and idempotency keys.
- Acceptance: duplicate events do not create duplicate notifications.
- Edge cases: notification created before mobile client is online.

## Ticket 5 - Mobile Realtime Integration
- Connect MobX stores to realtime status updates.
- Acceptance: feed and summary screens update without losing local state.
- Edge cases: user changes topic while receiving old topic events.

## No-Go Criteria
- Channels are not tenant-authorized.
- Reconnect has no resync path.
- Notifications are fire-and-forget only.
