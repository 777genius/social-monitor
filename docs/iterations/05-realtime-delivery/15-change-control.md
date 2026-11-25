# Iteration 05 - Change Control

## Change Types

| Change | Requires Review | Required Evidence |
| --- | --- | --- |
| WebSocket event change | Realtime/mobile owners | Version compatibility |
| Channel authorization change | Security owner | Tenant access impact |
| Notification rule change | Product/support owners | Duplicate/noise impact |
| Delivery retry change | Ops owner | Backoff and failure visibility |
| Webhook/API-key change | Security/ops owners | Audit and signing impact |

## Approval Rules

1. Do not change realtime events without mobile resync impact review.
2. Do not weaken WebSocket auth compared to REST auth.
3. Do not change notification idempotency keys without regression tests.
4. Do not expand external delivery into beta critical path.
5. Do not change replay/resync semantics without mobile store compatibility evidence.

## Rollback

- Revert WebSocket event versions by keeping previous event DTO active.
- Disable delivery endpoint while preserving in-app notifications.
- Pause digest job if duplicates occur.

## Audit Notes

Record event version, affected clients, notification rule and delivery behavior.

## Lightweight MVP Rule

Internal fanout implementation details can be change notes. Event contracts, auth rules, idempotency keys, replay behavior and external delivery semantics require ADR/change-control entry.
