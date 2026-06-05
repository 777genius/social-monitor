# Iteration 05 - Build Order Checklist

## Build Order

1. Define realtime event DTOs.
2. Implement WebSocket gateway.
3. Add connection authentication.
4. Add channel authorization.
5. Publish scan status.
6. Publish feed updates.
7. Publish summary status.
8. Add reconnect/resync.
9. Define notification preferences.
10. Build notification read model.
11. Add in-app notifications.
12. Add digest foundation.
13. Define webhook/API-key future ports.
14. Add delivery logs.
15. Add idempotency checks.

## First PR Sequence

1. PR 1: realtime event envelope, event catalog and channel naming.
2. PR 2: WebSocket gateway auth, workspace binding and subscription authorization.
3. PR 3: scan/source/summary status fanout with REST resync contract.
4. PR 4: replay cursor, replay window and `resync_required` behavior.
5. PR 5: mobile-facing notification/read model and idempotency.
6. PR 6: notification preferences and digest content schema.
7. PR 7: digest scheduler/assembly with stale/no-signal/suppression rules.
8. PR 8: delivery attempt state machine, retry and DLQ visibility.
9. PR 9: optional webhook/API-key minimal surface and tests.
10. PR 10: full reconnect/resync/delivery status integration test.

## Contracts First

- WebSocket event versions.
- Realtime channel naming.
- Notification read model API.
- Delivery log schema.
- Resync REST endpoint.
- Delivery attempt state machine.
- Digest content/provenance schema.
- Webhook payload/signature contract.

## Tests And Checks

- WebSocket auth tests.
- Channel authorization tests.
- Duplicate event notification test.
- Reconnect/resync test.
- Delivery retry test.
- Out-of-order/duplicate event tests.
- Authorization revocation during live connection.
- Digest idempotency and suppression tests.
- Webhook replay/signature/secret-rotation tests.
- Slow client/backpressure test.

## Edge Cases Before Closure

- User loses access while connected.
- Mobile misses event during reconnect.
- Topic deleted before event arrives.
- Notification preferences change mid-delivery.
- External webhook fails repeatedly.
- Replay cursor belongs to another workspace.
- Digest assembled from summary that becomes stale.
- Delivery succeeds externally but status update fails.
- Endpoint is quarantined while retry is pending.

## Closure

Close only when mobile can recover missed scan and summary status updates.
