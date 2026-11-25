# Iteration 05 - Decision Log

## Decision 001 - Reconnect/Resync Required

- Decision: WebSocket delivery must support reconnect and state resync.
- Alternatives: Fire-and-forget realtime events.
- Rationale: Mobile clients disconnect often; missed scan/summary status must be recoverable.
- Consequences: Requires resync API/state snapshot.
- Revisit When: Client delivery moves to durable push/inbox model.

## Decision 002 - External Delivery Is Future-Ready, Not Beta-Critical

- Decision: Webhooks/API keys are scaffolded but not required for beta success.
- Alternatives: Build full external integration platform now.
- Rationale: MVP user value is topic/feed/summary/realtime first.
- Consequences: Reduces launch scope while preserving extension path.
- Revisit When: Beta users require external automation as top workflow.
