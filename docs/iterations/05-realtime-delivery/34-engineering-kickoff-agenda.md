# Iteration 05 - Engineering Kickoff Agenda

## Meeting Goal
Add realtime status and delivery semantics without breaking tenant isolation or mobile consistency.

## Required Attendees
- Backend realtime lead.
- Mobile lead.
- Platform/infra owner.
- QA owner.
- Product owner.

## Agenda
1. Confirm realtime event DTOs and versions.
2. Confirm WebSocket auth and tenant channel authorization.
3. Confirm reconnect and resync behavior.
4. Confirm notification read model and idempotency.
5. Confirm mobile presentation states.

## Decisions To Lock
- Which events are beta-visible.
- Snapshot format after reconnect.
- Notification preference scope.
- Delivery log retention.

## Edge Cases To Discuss
- Mobile reconnects after missed events.
- User loses access while subscribed to a channel.
- Duplicate notification events are delivered.
- Summary completes before feed screen is open.

## First-Day Output
- Event contract tickets are ready.
- Gateway authorization requirements are clear.
- Mobile resync handling is planned.
- Notification idempotency is testable.
