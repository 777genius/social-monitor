# Iteration 05 - Day By Day Sequence

## Day 1 - Realtime Contract

- Define WebSocket event DTOs.
- Define channels.
- Define resync contract.
- Check: versioning and auth impact are clear.

## Day 2 - Gateway

- Implement WebSocket gateway.
- Add auth and channel authorization.
- Emit scan/feed/summary status.
- Check: unauthorized channel join fails.

## Day 3 - Mobile Resync

- Integrate mobile subscriptions.
- Implement reconnect/resync.
- Check: missed events recover after reconnect.

## Day 4 - Notifications

- Build notification read model.
- Add idempotency.
- Add digest preferences.
- Check: duplicate events produce one notification.

## Day 5 - Delivery Logs And Closure

- Add delivery logs.
- Test failed external delivery.
- Run realtime acceptance scenarios.
- Stop if missed events or duplicate notifications remain.
