# Iteration 05 - Team Ownership And Communication

## Communication Goal
Keep realtime delivery aligned with authorization, mobile resync and operational diagnostics.

## Decision Owners
- Realtime lead: event DTOs and gateway.
- Auth owner: channel authorization.
- Mobile lead: reconnect/resync behavior.
- Backend lead: notification read model.

## Reviewers
- Security owner reviews tenant-channel access.
- Operations owner reviews delivery observability.
- QA owner reviews duplicate and reconnect tests.

## Sync Points
- Kickoff: confirm events and channel rules.
- Midpoint: review reconnect and notification idempotency.
- Closeout: confirm hardening readiness.

## Escalate When
- WebSocket auth differs from REST.
- Realtime becomes source of truth.
- Mobile cannot recover missed events.
- Duplicate notifications appear.

## Handoff Message
Realtime is ready when hardening can test authorization, recovery and delivery observability across REST, events and WebSocket paths.
