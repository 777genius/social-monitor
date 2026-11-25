# Iteration 05 - QA Acceptance Signoff

## Signoff Goal
Confirm that realtime delivery is authorized, recoverable and idempotent.

## Acceptance Scenarios
- Authorized user subscribes to tenant channel.
- Scan/feed/summary events update mobile state.
- Reconnect triggers resync.
- Duplicate event does not duplicate notification.
- Delivery failure is observable.

## Negative Cases
- User subscribes to another tenant channel.
- Token expires during connection.
- Access is revoked while connected.
- Event arrives while snapshot loads.

## Regression Coverage
- WebSocket auth tests.
- Reconnect/resync scenarios.
- Notification idempotency tests.
- Event schema/version snapshots.

## Residual Risks
- External webhooks can remain future scope.
- Advanced notification preferences can be simplified.

## Approvers
- Realtime lead.
- Mobile lead.
- Backend lead.
- Operations owner.
