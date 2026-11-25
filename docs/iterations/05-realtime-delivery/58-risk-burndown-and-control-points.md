# Iteration 05 - Risk Burndown And Control Points

## Burndown Goal
Reduce authorization, recovery and duplicate-delivery risk before hardening.

## Day 1 Control Point
- Event DTOs are versioned.
- Channel authorization rules are agreed.
- Resync contract is drafted.

## Midpoint Control Point
- WebSocket auth tests pass.
- Reconnect/resync scenario is implemented.
- Notification idempotency is tested.

## Closeout Control Point
- Unauthorized subscription is blocked.
- Missed events are recoverable.
- Duplicate events do not duplicate notifications.

## Escalation Threshold
Escalate if realtime behavior conflicts with REST/read-model source of truth.

## Residual Risk Rule
Advanced delivery channels may carry forward; auth, resync and idempotency risks may not.
