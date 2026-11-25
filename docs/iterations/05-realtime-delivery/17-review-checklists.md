# Iteration 05 - Review Checklists

## Realtime Review

1. WebSocket auth matches REST authorization strength.
2. Channel access is tenant/workspace-scoped.
3. Event DTOs are versioned.
4. Reconnect/resync recovers missed state.

## Notification Review

1. Notification creation is idempotent.
2. Duplicate events do not duplicate notifications.
3. Preferences are respected.
4. Delivery failures are logged.

## Scope Review

1. Webhook/API-key path does not become beta critical path.
2. Realtime gateway does not own domain state.
3. External delivery retry behavior is bounded.
