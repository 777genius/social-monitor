# Iteration 05 - Quality Gates And Risk Register

## Hard Gates

1. WebSocket gateway authenticates users.
2. Channel authorization enforces tenant/workspace access.
3. Scan status events reach mobile.
4. Summary status events reach mobile.
5. Reconnect/resync behavior exists.
6. Notification creation is idempotent.
7. Digest preferences exist.
8. Delivery logs exist.
9. Failed delivery is visible.
10. Webhook/API-key future path is isolated from beta critical path.

## Architecture Checks

- Realtime gateway does not own domain state.
- WebSocket DTOs are versioned.
- Notification read model consumes events idempotently.
- Delivery adapters are replaceable.
- Offline mobile resync can recover missed events.

## Risk Register

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Mobile misses events during reconnect | Stale UX | Add resync endpoint/state snapshot. |
| Duplicate events create duplicate notifications | Noise | Idempotency key per notification source event. |
| WebSocket auth is weaker than REST auth | Data leak | Reuse authorization policies. |
| Delivery retries overload external endpoint | Partner risk | Backoff and retry budget. |
| External integrations distract from MVP | Scope creep | Keep webhook/API-key as future-ready foundation. |

## Edge Cases To Recheck

- User loses access while connected.
- Topic is deleted before realtime event arrives.
- Notification preference changes while delivery is queued.
- Webhook endpoint fails for hours.
- Mobile wakes after long offline period.

## Transition Criteria

Move to Iteration 06 only when scan and summary status update reliably in the app and missed events can be recovered.
