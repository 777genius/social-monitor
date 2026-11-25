# Iteration 05 - MVP Scope Guardrails

## In Scope

1. WebSocket scan/feed/summary status.
2. Reconnect/resync.
3. In-app notifications.
4. Digest foundation.
5. Delivery logs.
6. Future-ready webhook/API-key ports.

## Out Of Scope

1. Full external integration marketplace.
2. Complex notification channel matrix.
3. Realtime analytics streams.
4. Making webhooks beta-critical.

## Scope Creep Signals

- External delivery delays mobile status.
- Notification features expand before idempotency.
- Realtime events are added without resync path.

## Decision Rule

Accept delivery work only if it improves user awareness, recovery from missed events or future extension without blocking beta.

## Complexity Budget

- Build deeply: WebSocket status, reconnect/resync, in-app notifications, delivery logs and idempotent digest foundation.
- Define lightly: webhooks, API keys, external delivery adapters and future machine interfaces.
- Defer: integration marketplace, complex notification channel matrix, realtime analytics and beta-critical webhooks.
