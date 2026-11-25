# Iteration 05 - Role-Based Execution Plan

## Realtime Backend

- Implement WebSocket gateway.
- Define event DTOs.
- Implement reconnect/resync.

## Security

- Review channel authorization.
- Ensure WebSocket auth matches REST auth.
- Review API key/webhook future path.

## Mobile Engineer

- Subscribe to realtime status.
- Implement reconnect UX.
- Verify missed state recovery.

## Notification Owner

- Build notification read model.
- Implement idempotency.
- Prepare digest foundation.

## QA/Ops

- Test duplicate events.
- Test reconnect.
- Inspect delivery logs.

## Handoffs

- Realtime events -> mobile.
- Delivery logs -> ops.
- Notification preferences -> support/product.
