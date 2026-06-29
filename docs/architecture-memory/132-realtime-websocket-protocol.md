# 132. Realtime WebSocket Protocol

## Status

Locked for realtime baseline.

## Research Anchors

- RFC 6455 WebSocket Protocol: https://www.rfc-editor.org/rfc/rfc6455
- AsyncAPI Specification: https://www.asyncapi.com/docs/reference/specification/latest

## Decision

Use WebSocket for realtime invalidation and lightweight state changes. REST remains the source of truth.

## Connection Model

Client connects with short-lived auth token and selected tenant id.

Server validates:

- user identity;
- tenant membership;
- session status;
- client app version where needed.

Subscriptions:

- `tenant:{tenant_id}:feed`;
- `topic:{topic_id}:items`;
- `digest:{tenant_id}`;
- `source_binding:{binding_id}:status`;
- `notification:{tenant_id}:delivery`.

## Message Envelope

```json
{
  "type": "feed.item_added",
  "version": 1,
  "id": "evt_01j...",
  "tenantId": "ten_123",
  "occurredAt": "2026-05-31T12:00:00Z",
  "payload": {
    "itemId": "itm_123",
    "interestId": "int_123"
  }
}
```

## Reliability

WebSocket messages are not the durable source of truth.

Rules:

- send heartbeat/ping;
- disconnect idle/dead clients;
- rate-limit subscriptions;
- drop or coalesce high-volume updates;
- client refetches REST after reconnect using last known state;
- server exposes `sync_required` when client is too stale.

## Best-Fact Choice

Realtime should improve UX, not become a second data store. Use it mostly for invalidation and small status updates.

