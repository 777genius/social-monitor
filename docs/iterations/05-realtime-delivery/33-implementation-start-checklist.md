# Iteration 05 - Implementation Start Checklist

## Prerequisites

1. Mobile core loop works.
2. Scan/feed/summary status states exist.
3. Event contracts are versioned.
4. Tenant authorization policies exist.

## Locked Before Work

1. WebSocket auth must match REST auth strength.
2. Reconnect/resync is mandatory.
3. Notification idempotency is mandatory.
4. External delivery is not beta-critical.

## First Tickets

1. Define realtime DTOs.
2. Build WebSocket gateway.
3. Add resync snapshot.
4. Build notification read model.

## No-Go Items

- Fire-and-forget realtime without resync.
- Notifications without idempotency.
- Webhooks blocking MVP beta.
