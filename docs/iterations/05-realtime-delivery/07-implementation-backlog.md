# Iteration 05 - Implementation Backlog

## Purpose

Add realtime status, notifications, digests and external delivery without making the ingestion pipeline depend on UI availability.

## WebSocket Backlog

1. Define WebSocket gateway.
2. Define tenant/workspace channel authorization.
3. Define events for scan status, feed item updates, summary status and notification status.
4. Add connection lifecycle handling.
5. Add reconnect/resync strategy for mobile.
6. Add heartbeat and stale connection cleanup.
7. Add message versioning.

## Notification Backlog

1. Define notification preferences.
2. Define digest schedule.
3. Define notification templates.
4. Implement in-app notifications.
5. Implement email placeholder or adapter interface.
6. Implement push notification placeholder or adapter interface.
7. Add quiet hours and opt-out controls.

## Webhook/API Key Backlog

1. Define API key aggregate and hashing.
2. Define webhook endpoint aggregate.
3. Define delivery signing.
4. Define retry and dead-letter behavior.
5. Define delivery event log.
6. Add rate limits and tenant quotas.

## Event Backlog

1. Consume `feed_item.upserted`.
2. Consume `summary.completed`.
3. Produce delivery commands.
4. Persist notification read model.
5. Ensure delivery processing is idempotent.

## Edge Cases

- User is offline when summary completes.
- WebSocket reconnect misses intermediate events.
- Notification is generated twice after retry.
- Webhook endpoint returns 500 for hours.
- User disables notifications while delivery is queued.
- Future frontend or API harness receives event for deleted topic.

## Validation

- Realtime status updates arrive without polling.
- Reconnect performs state sync.
- Duplicate events do not duplicate notifications.
- Failed delivery is visible and retryable.
