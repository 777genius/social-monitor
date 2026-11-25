# Iteration 05 - Architecture Decision Record Seeds

## Purpose
List realtime decisions that must be recorded before hardening.

## ADR Seeds
- Match WebSocket authorization to REST authorization.
- Use REST/read model as source of truth.
- Require reconnect/resync path.
- Persist notification idempotency keys.
- Version realtime event DTOs.

## Alternatives To Capture
- Realtime as primary state vs realtime as enhancement.
- Per-feature channels vs tenant/topic-scoped channels.
- Ephemeral notifications vs durable read model.

## Consequences To Record
- Resync support adds API/read-model work but protects mobile consistency.
- Durable notification state improves supportability.
- Strict channel auth reduces flexibility but protects tenant data.

## Revisit Triggers
- Mobile latency requirements change.
- Notification volume grows.
- External delivery/webhooks become product-critical.
