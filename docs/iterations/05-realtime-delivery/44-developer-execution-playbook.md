# Iteration 05 - Developer Execution Playbook

## Reading Order
1. Read `01-websocket-service.md`.
2. Read `35-first-sprint-ticket-cut.md`.
3. Read `38-architecture-compliance-audit.md`.
4. Read `39-contract-dependency-checklist.md`.
5. Read `41-test-fixtures-and-scenarios.md`.

## PR Slicing
- PR 1: realtime event DTOs.
- PR 2: WebSocket gateway and channel authorization.
- PR 3: reconnect/resync snapshot.
- PR 4: notification read model and idempotency.
- PR 5: mobile realtime store integration.
- PR 6: delivery observability.

## Checks Before PR
- Channel auth matches REST auth.
- Events are versioned and tenant-scoped.
- Reconnect can recover missed state.
- Duplicate events do not duplicate notifications.
- REST/read model remains source of truth.

## Evidence To Attach
- Event schema/version diff.
- Auth test for allowed and denied channel access.
- Reconnect/resync scenario result.
- Duplicate-event idempotency proof.
- Delivery log or metric sample when delivery behavior changes.

## Architecture Guardrails
- Gateway calls application services.
- Realtime enhances state, it does not replace correctness.
- Notification creation is durable and idempotent.

## Escalate When
- A live event needs internal persistence fields.
- Authorization differs between REST and WebSocket.
- Mobile cannot recover after missed events.
