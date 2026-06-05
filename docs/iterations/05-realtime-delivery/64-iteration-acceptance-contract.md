# Iteration 05 - Iteration Acceptance Contract

## Provider
Realtime team provides authorized live updates, resync behavior and notification idempotency.

## Receiver
Iteration 06 hardening team receives realtime paths for security, observability and beta readiness.

## Handoff Promises
- WebSocket auth matches REST auth.
- Tenant channel authorization is tested.
- Reconnect/resync recovers missed state.
- Duplicate events do not duplicate notifications.
- Delivery failures are observable.

## Receiver Expectations
- Hardening can test realtime for tenant isolation.
- Operations can diagnose delivery failures.
- Support can explain missed update recovery.

## Blocking Defects
- Unauthorized subscription succeeds.
- Reconnect loses state permanently.
- Duplicate notification.
- Realtime becomes source of truth.

## Allowed Exceptions
- External webhooks can wait.
- Advanced notification preferences can wait.
