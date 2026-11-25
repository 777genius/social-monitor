# Iteration 05 - Backlog Prioritization Matrix

## Prioritization Goal
Make realtime authorized and recoverable before adding delivery breadth.

## P0 - Do First
- Event DTOs.
- WebSocket auth.
- Tenant channel authorization.
- Reconnect/resync.
- Notification idempotency.

## P1 - Do After P0
- Mobile live updates.
- Delivery logs.
- Delivery metrics.
- Notification read model.
- Duplicate event tests.

## P2 - Defer If Needed
- External webhooks.
- Advanced digests.
- Multi-channel notification expansion.
- Complex notification preferences.

## Prioritize Higher When
- Work affects tenant authorization.
- Work affects recovery after disconnect.
- Work affects duplicate user-visible effects.
- Work affects hardening visibility.

## Do Not Prioritize
- New delivery channels before resync.
- Live effects before source-of-truth consistency.
- Notification UX before idempotency.
