# Iteration 05 - Traceability Matrix

| Goal | Phase | Ticket Area | Contract/Artifact | Tests/Checks | Done Evidence |
| --- | --- | --- | --- | --- | --- |
| Add realtime status | 01-websocket-service | Realtime API | WebSocket gateway, event DTOs | Auth/channel tests | Status arrives in mobile |
| Add notifications | 02-notifications-digests | Notification | Preferences, read model | Idempotency tests | No duplicate notifications |
| Add external delivery base | 03-webhooks-api-keys | Delivery | API keys, webhooks, delivery log | Retry tests | Delivery failures visible |
| Document future interface | 04-mcp-future-interface | Future contracts | Future interface notes | Scope review | Not beta critical path |
| Recover missed events | 01-websocket-service | Resync | Resync endpoint/state snapshot | Reconnect test | Mobile recovers state |

## Unmapped Risk Check

- Missed events map to reconnect/resync.
- Duplicate notifications map to idempotency keys.
- Weak realtime auth maps to auth parity review.
- Scope creep maps to future-interface isolation.
