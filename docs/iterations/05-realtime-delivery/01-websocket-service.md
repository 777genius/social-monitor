# Iteration 05 / Phase 01 - WebSocket Service

## Objective

Implement realtime service for tenant-scoped status notifications.

## Steps

1. Define WS handshake auth and protocol version.
2. Implement subscription authorization per topic/source/tenant.
3. Add event envelope with sequence/cursor.
4. Publish scan/source/summary events to WS fanout.
5. Add reconnect strategy and REST recovery signal.
6. Add rate limits and message size limits.
7. Define replay window and resync cutoff behavior.
8. Define per-subscription sequence rules.
9. Define mobile fallback: REST snapshot remains source of truth.

## Realtime Contract Invariants

- WebSocket never mutates domain state directly.
- REST/read models remain source of truth.
- Every WS event has protocol version, event type, tenant/workspace scope, resource id, sequence/cursor and occurred-at timestamp.
- Client must tolerate duplicate, delayed and out-of-order events.
- If replay cursor is too old or missing, client must refresh REST snapshot.
- Authorization is checked on connect and subscription, then rechecked on membership/token changes.
- Slow clients are disconnected or degraded before service memory grows unbounded.

## WebSocket Protocol Baseline

Connection:

1. client connects with auth token and protocol version
2. server validates tenant/workspace access
3. server returns connection id, accepted protocol version and heartbeat interval
4. client subscribes to workspace/topic/resource channels
5. server authorizes each subscription independently

Event envelope:

- `protocolVersion`
- `eventId`
- `eventType`
- `tenantId`
- `workspaceId`
- `resourceType`
- `resourceId`
- `sequence`
- `replayCursor`
- `occurredAt`
- `correlationId`
- `payload`

Replay/resync:

1. Client sends last known replay cursor per subscription.
2. Server replays only inside bounded replay window.
3. If cursor is missing, too old or unauthorized, server returns `resync_required`.
4. Client fetches REST snapshot and replaces local visible state.
5. Client then resumes subscription from new cursor.

## Channel Naming

Use stable, tenant-scoped channels:

- `workspace:{workspaceId}:operations`
- `topic:{topicId}:scan-status`
- `topic:{topicId}:feed-status`
- `topic:{topicId}:summary-status`
- `source-binding:{bindingId}:health`

Do not expose provider names, raw source queries or secrets in channel names.

## Edge Cases

- Token expires during WS connection.
- User loses tenant access while connected.
- Event arrives out of order.
- Client misses replay window.
- Same user connects from multiple devices with different cursors.
- Topic is deleted while client is subscribed.
- Summary status event arrives before mobile has the summary list snapshot.
- Client sends replay cursor from another workspace.
- Authorization changes between replay and live event fanout.
- Slow client accumulates many undelivered messages.
- Event payload references resource that REST no longer returns.

## Pay Attention

- WS is not CRUD.
- Every subscription needs authorization.
- Slow clients must not consume unbounded memory.
- Event payload should be small enough for mobile; large detail is fetched via REST.
- Sequence is per subscription/channel, not a global business order.
- Reconnect behavior must be deterministic enough for store tests.

## Acceptance Criteria

- Client receives scan and summary status.
- Unauthorized subscription is denied.
- Reconnect reloads REST if replay unavailable.
- Session revocation disconnects or blocks messages.
- Duplicate/out-of-order events do not corrupt mobile store state.
- Replay cutoff returns explicit resync-required signal.
- WS envelope and channel naming are documented and testable.
- REST resync path works for missed summary/feed/scan events.
