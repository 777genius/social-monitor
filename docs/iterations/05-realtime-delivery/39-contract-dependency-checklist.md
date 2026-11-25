# Iteration 05 - Contract Dependency Checklist

## Purpose
Make realtime and notification contracts stable enough for hardening, monitoring and beta support.

## Input Dependencies
- Scan, feed and summary event contracts.
- REST auth and tenant authorization rules.
- Mobile store state contracts.
- Notification preference assumptions.

## Output Contracts
- WebSocket event DTOs.
- Channel authorization contract.
- Reconnect/resync contract.
- Notification read-model schema.
- Delivery log contract.

## Owners
- Realtime lead owns event DTOs and gateway contracts.
- Mobile lead owns client resync behavior.
- Backend lead owns notification idempotency.
- Operations owner owns delivery observability.

## Breaking-Change Risks
- Event payload shape changes after mobile subscriptions.
- Channel naming changes without migration.
- Resync behavior differs from REST source-of-truth.
- Notification idempotency changes after delivery logs exist.

## Transition Readiness
- Iteration 06 can test realtime tenant isolation.
- Operations can observe delivery failures.
- Mobile can recover missed events without manual refresh assumptions.
