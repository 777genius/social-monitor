# Iteration 05 - Definition Of Done

## Done Checklist

1. WebSocket gateway exists.
2. Connection authentication works.
3. Channel authorization works.
4. Scan status updates arrive.
5. Feed updates arrive.
6. Summary status updates arrive.
7. Reconnect/resync works.
8. Notification read model exists.
9. Notification idempotency exists.
10. Digest preferences exist.
11. Delivery logs exist.
12. Webhook/API-key future path is isolated from beta critical path.

## Architecture Done

- Realtime gateway does not own domain state.
- Events and WebSocket DTOs are versioned.
- Notifications consume events idempotently.
- Delivery adapters are replaceable.

## Evidence Required

- WebSocket auth test.
- Reconnect/resync test.
- Duplicate notification test.
- Delivery log sample.
- Mobile status update smoke result.

## Not Done If

- Reconnect misses state permanently.
- Duplicate events duplicate notifications.
- Realtime auth is weaker than REST auth.
- Failed delivery is invisible.
