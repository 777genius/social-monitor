# Iteration 05 - Traceable Evidence Register

## Evidence Goal
Prove that realtime is authorized, recoverable and idempotent.

## Critical Audit Evidence
- WebSocket events are hints and REST/read models remain source of truth.
- Replay/resync tests cover missed, duplicate and out-of-order events.
- Delivery attempt idempotency and preference recheck evidence exists.
- External payloads reference resources and avoid sensitive raw content.
- Membership revoke, preference change, endpoint quarantine and superseded-summary race fixtures pass.
- Digest/replay/webhook temporal fixtures prove UTC window identity, DST behavior, replay expiry and timestamp skew.

## Decision Evidence
- WebSocket auth decision.
- Channel authorization model.
- Reconnect/resync contract.
- Notification idempotency decision.
- Event DTO versioning rule.

## Ticket Evidence
- Gateway tickets link to channel auth tests.
- Resync tickets link to reconnect traces.
- Notification tickets link to duplicate-event tests.
- Observability tickets link to delivery logs/metrics.

## Review Evidence
- Security owner reviews tenant-channel access.
- Mobile lead reviews recovery behavior.
- Operations owner reviews delivery diagnostics.

## Handoff Evidence
- Hardening iteration accepts realtime paths for isolation tests.
- Support receives missed-update diagnostic notes.

## Missing Evidence Blocks
- Unauthorized subscription test absent.
- Resync scenario absent.
- Notification idempotency evidence absent.
- Temporal delivery evidence absent for digest window, replay expiry or webhook timestamp skew.
