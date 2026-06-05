# Iteration 05 - Execution Calendar And Cadence

## Cadence Goal
Deliver authorized and recoverable realtime behavior before hardening.

## Kickoff
- Confirm event DTOs, channel authorization, resync contract and notification owner.
- Review REST auth parity.
- Confirm mobile store integration path.

## Midpoint
- Run WebSocket auth tests.
- Run reconnect/resync scenario.
- Run notification idempotency test.

## Review
- Demonstrate live scan/feed/summary updates.
- Demonstrate missed event recovery.
- Review delivery logs and metrics.

## Closeout
- Complete realtime go/no-go.
- Hand off realtime paths to hardening.
- Record future delivery channel carryover.

## Stop Conditions
- Unauthorized subscription succeeds.
- Reconnect loses state permanently.
- Duplicate events create duplicate notifications.
