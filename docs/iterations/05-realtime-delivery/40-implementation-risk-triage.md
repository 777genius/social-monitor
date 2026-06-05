# Iteration 05 - Implementation Risk Triage

## Triage Goal
Detect realtime risks before they compromise authorization, consistency or mobile recoverability.

## Critical Risks
- WebSocket authorization is weaker than REST authorization.
- Realtime becomes required for correctness.
- Reconnect/resync behavior is missing.
- Duplicate events create duplicate notifications.

## Early Warning Signals
- Channel names do not include tenant/topic authorization context.
- Mobile cannot recover missed updates through REST/snapshot.
- Event payloads expose internal persistence data.
- Notification writes have no idempotency key.

## Owners
- Realtime lead owns gateway and event contracts.
- Backend lead owns notification read model.
- Mobile lead owns resync behavior.
- Operations owner owns delivery observability.

## Mitigations
- Match WebSocket auth rules to REST permissions.
- Keep REST/read model as source of truth.
- Add resync snapshot before broad realtime UI.
- Persist notification idempotency keys.

## Stop-Work Triggers
- Unauthorized tenant can subscribe to a channel.
- Reconnect loses user-visible state permanently.
- Duplicate event creates duplicate notification.

## MVP Risk Cutline
- Fix now: channel auth, reconnect/resync, notification idempotency and REST source-of-truth rule.
- Carry with owner: digest polish and delivery-channel tuning.
- Defer: external integration marketplace and beta-critical webhooks.
