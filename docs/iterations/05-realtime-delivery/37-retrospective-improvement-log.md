# Iteration 05 - Retrospective Improvement Log

## Retrospective Goal
Capture whether realtime and notifications improve the loop while remaining authorized, recoverable and non-essential for correctness.

## What Worked
- Tenant-scoped event DTOs made channel authorization reviewable.
- Resync path reduced dependence on perfect WebSocket delivery.
- Notification idempotency prevented duplicate user-visible events.

## What To Improve
- Add more reconnect timing tests.
- Tighten event version compatibility checks.
- Improve support visibility into delivery failures.

## Architecture Lessons
- Realtime should enhance REST state, not replace the source of truth.
- Channel authorization must be as strict as REST authorization.
- Notifications are stateful domain artifacts, not fire-and-forget messages.

## Edge Cases Found
- User loses access while connected.
- Duplicate event arrives after reconnect.
- Mobile changes topic during event stream update.
- Snapshot and live events race.

## Carryover To Next Iteration
- Hardening must include realtime tenant isolation tests.
- Delivery metrics must feed operations dashboards.
- Any unsupported external delivery channel stays out of beta scope.
