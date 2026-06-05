# Iteration 05 - Release Gate And Promotion

## Promotion Goal
Approve movement from realtime delivery into production hardening.

## Required Evidence
- WebSocket authentication works.
- Tenant channel authorization is tested.
- Reconnect/resync restores missed state.
- Notification idempotency prevents duplicates.
- Delivery failures are observable.

## Promotion Checks
- Realtime is not the sole source of truth.
- Event DTOs are versioned and tenant-scoped.
- Mobile can recover through snapshot/resync.
- Notification read model has durable state.

## Hold Conditions
- Unauthorized subscription is possible.
- Reconnect loses state permanently.
- Duplicate event creates duplicate notification.
- Delivery logs cannot support debugging.

## Rollback Or Rework
- Rework channel authorization before beta hardening.
- Rework resync before mobile relies on live updates.
- Rework notification idempotency before digests/alerts expand.

## Approval
Realtime may promote only when hardening can test REST, workers, events and WebSocket paths together.
