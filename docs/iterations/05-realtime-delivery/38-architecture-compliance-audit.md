# Iteration 05 - Architecture Compliance Audit

## Audit Goal
Verify that realtime delivery is authorized, versioned, recoverable and consistent with REST state.

## Required Checks
- Realtime events are versioned and tenant-scoped.
- WebSocket authorization matches REST authorization rules.
- Reconnect/resync path exists and is tested.
- Notifications use idempotency keys.
- Mobile stores handle live updates without duplicating business rules.

## Critical Violations
- Tenant channel access is weaker than REST access.
- Realtime becomes the only source of truth.
- Duplicate events create duplicate notifications.
- Event payloads expose internal persistence or provider-specific data.

## SOLID And Clean Architecture Focus
- Dependency inversion: gateways call application services, not domain mutation directly.
- Single responsibility: event publication, channel auth and notification creation are separate.
- Open/closed: adding a new event type should not rewrite the whole gateway.

## Evidence Required
- Channel authorization tests.
- Reconnect/resync scenario.
- Duplicate notification test.
- Event schema/version examples.
- Mobile live update test.

## Closure Rule
Iteration 06 cannot start if realtime paths are not included in tenant isolation and observability scope.
