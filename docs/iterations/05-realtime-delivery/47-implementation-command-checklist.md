# Iteration 05 - Implementation Command Checklist

## Purpose
Record realtime verification before gateway, event or notification changes are reviewed.

## Local Checks
- Run WebSocket auth tests.
- Run tenant channel authorization tests.
- Run reconnect/resync scenario.
- Run duplicate event notification test.
- Verify event schema/version snapshots.

## Evidence To Attach
- Auth test output.
- Resync trace.
- Notification idempotency result.
- Event DTO snapshot.

## MVP Evidence Rule
- Required: auth, reconnect/resync, duplicate-event and source-of-truth behavior proof.
- Defer: external integration marketplace tests; keep webhooks/API keys future-ready unless beta requires them.

## Blocking Failures
- Unauthorized channel subscription succeeds.
- Reconnect loses state permanently.
- Duplicate event creates duplicate notification.
- Realtime becomes source of truth.
