# Iteration 05 - Scope Change Decision Tree

## Decision Goal
Prevent realtime scope changes from weakening authorization or recovery.

## Accept Now If
- Change improves channel authorization.
- Change improves reconnect/resync.
- Change improves notification idempotency or delivery observability.

## Defer If
- Change adds external webhooks before beta needs them.
- Change adds advanced digest preferences.
- Change adds broad notification channels beyond MVP.

## Escalate To ADR If
- Change alters event schema or channel naming.
- Change changes source-of-truth semantics.
- Change changes mobile resync contract.

## Block If
- Change allows weaker WebSocket auth than REST auth.
- Change makes realtime required for correctness.
- Change creates duplicate user-visible notifications.

## Required Record
- Event contract impact.
- Tenant authorization impact.
- Mobile resync impact.
- Operations/support impact.
