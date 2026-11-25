# Iteration 05 - Anti-Patterns And Forbidden Shortcuts

## Purpose
Prevent realtime work from weakening correctness, tenant isolation or recovery.

## Forbidden Shortcuts
- Making realtime the source of truth.
- Using weaker WebSocket authorization than REST.
- Creating notifications without idempotency key.
- Shipping realtime without reconnect/resync.

## Architecture Anti-Patterns
- Event payloads exposing persistence internals.
- Channel names that cannot be authorized by tenant/topic.
- Gateway mutating domain state directly.

## Product Anti-Patterns
- Treating live updates as a substitute for reliable status.
- Hiding missed update recovery.
- Adding external delivery channels before MVP delivery is stable.

## Stop Immediately If
- Unauthorized subscription succeeds.
- Duplicate event creates duplicate notification.
- Mobile cannot recover missed events.
