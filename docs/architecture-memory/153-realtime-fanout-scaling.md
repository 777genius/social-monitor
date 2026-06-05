# 153. Realtime Fanout Scaling

## Status

Locked for realtime scaling baseline.

## Research Anchors

- RFC 6455 WebSocket Protocol: https://www.rfc-editor.org/rfc/rfc6455
- Socket.IO Redis adapter: https://socket.io/docs/v4/redis-adapter/
- AsyncAPI Specification: https://www.asyncapi.com/docs/reference/specification/latest

## Decision

Realtime fanout is a separate gateway concern. It should subscribe to durable events/projections and broadcast lightweight invalidation/state messages to connected clients.

## Topology

```text
Kafka/domain events -> realtime projector -> Redis/pubsub or broker fanout
-> realtime-gateway replicas -> WebSocket clients
```

Redis pub/sub or a Socket.IO Redis adapter is acceptable for early multi-replica fanout. It is not a durable message store.

## Limits

Enforce:

- max connections per user/tenant;
- max subscriptions per connection;
- max messages per second per connection;
- payload size limits;
- heartbeat timeout;
- slow-client disconnect;
- tenant-level fanout throttles.

## Message Strategy

Prefer:

- `feed.updated`;
- `topic.status_changed`;
- `source_binding.needs_attention`;
- `digest.ready`;
- `sync_required`.

Avoid sending full large feed pages or raw source content over WebSocket.

## Best-Fact Choice

Realtime should be lossy-but-recoverable. Durable truth stays in REST/read models; WebSocket is for timely invalidation and small state changes.

