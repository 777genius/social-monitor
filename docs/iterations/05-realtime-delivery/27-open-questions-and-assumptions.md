# Iteration 05 - Open Questions And Assumptions

## Working Assumptions

1. WebSocket is used for realtime status.
2. REST snapshot is needed for reconnect/resync.
3. In-app notifications are MVP; external delivery is future-ready.
4. Notification creation must be idempotent.

## Open Questions

| Question | Owner | Deadline | Decision Impact |
| --- | --- | --- | --- |
| What is the exact resync snapshot shape? | Realtime/mobile | Before mobile integration | Reconnect reliability |
| Which events should be sent realtime vs only stored? | Backend/product | Before gateway | Event volume |
| Are email/push channels beta scope? | Product/support | Before notification work | Delivery scope |
| What retention is needed for delivery logs? | Ops/security | Before persistence | Audit/storage |

## Validation Rule

Do not add notification channels before reconnect/resync and idempotency are proven.
