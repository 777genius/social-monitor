# Iteration 05 - Master Implementation Sequence

## PR Slice Rule
- One PR should change one delivery slice: event DTO, channel auth, reconnect/resync, notification model, mobile realtime integration or delivery observability.
- Each PR must preserve REST/read model as source of truth.
- Split if external webhook/API-key work delays in-app status reliability.

## Step 1 - Open Control Docs
- Read WebSocket phase, contract checklist and risk burndown.
- Confirm realtime, auth, mobile, backend and operations owners.
- Check channel auth, resync and idempotency blockers.

## Step 2 - Cut Tickets
- Create event DTO ticket.
- Create WebSocket gateway/auth ticket.
- Create reconnect/resync ticket.
- Create notification read-model ticket.
- Create mobile live integration ticket.
- Create delivery observability ticket.

## Step 3 - Execute In Order
- Define versioned event DTOs first.
- Implement channel auth before subscriptions.
- Implement resync before relying on live updates.
- Implement notification idempotency before notification UX.

## Step 4 - Validate
- Run auth, reconnect/resync and duplicate-notification tests.
- Verify delivery logs/metrics.
- Confirm realtime does not replace REST/read model.

## Step 5 - Close
- Fill final go/no-go.
- Handoff realtime paths to hardening.
- Promote only when realtime can be included in tenant isolation and observability gates.
