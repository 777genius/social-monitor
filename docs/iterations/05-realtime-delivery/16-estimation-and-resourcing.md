# Iteration 05 - Estimation And Resourcing

## Relative Effort

- Complexity: Medium-high
- Risk: Medium because missed/duplicate events are user-visible
- Recommended duration: 1 sprint

## Required Roles

- Backend realtime engineer
- Mobile engineer
- Notification/delivery owner
- Security reviewer
- QA for reconnect/idempotency

## Parallel Work

1. WebSocket gateway and event DTOs first.
2. Mobile realtime integration can run with mocked events.
3. Notifications and digest foundation can run after event idempotency is defined.

## Bottlenecks

- Auth/channel rules block safe realtime.
- Resync contract blocks reliable mobile.
- Notification idempotency blocks digest confidence.

## No-Cut Areas

- Channel authorization.
- Reconnect/resync.
- Notification idempotency.
- Delivery logs.
- Failure visibility.
