# Iteration 05 - Final Go/No-Go Checklist

## Decision Scope
Decide whether realtime delivery is ready for production hardening.

## Go Conditions
- WebSocket auth matches REST auth.
- Tenant channel authorization is tested.
- Reconnect/resync works.
- Duplicate events do not duplicate notifications.
- Delivery failures are observable.

## Hold Conditions
- External webhooks are not implemented.
- Advanced notification preferences are deferred.

## Rework Conditions
- Unauthorized subscription succeeds.
- Realtime becomes source of truth.
- Missed events cannot be recovered.
- Notification idempotency is missing.

## Accepted Exceptions
- Digest scheduling can mature later.
- Additional delivery channels can wait.

## Critical Audit Evidence
- WS replay/resync and REST snapshot recovery tests pass.
- Notification/delivery idempotency and preference recheck evidence is attached.
- Realtime events do not become durable source of truth.
- Membership revoke, preference change and endpoint quarantine races are tested.
- Digest/replay/webhook temporal boundaries are covered by fake-clock and timestamp-skew fixtures.

## Decision Record
Record decision as `go`, `hold` or `rework` with auth, resync, idempotency and observability evidence.
