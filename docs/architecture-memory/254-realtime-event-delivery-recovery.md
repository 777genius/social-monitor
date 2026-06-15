# 254 - Realtime Event Delivery Recovery

## Decision

Realtime WebSocket events are typed, versioned notifications with recovery through REST read models.

The system does not promise exactly-once WebSocket delivery.

## Sources

- WebSocket RFC 6455: https://datatracker.ietf.org/doc/html/rfc6455
- AsyncAPI Specification: https://www.asyncapi.com/
- CloudEvents specification: https://github.com/cloudevents/spec
- OWASP WebSocket Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html

## Event Envelope

Every client event uses:

```json
{
  "id": "evt_...",
  "type": "summary.ready",
  "version": 1,
  "tenant_id": "ten_...",
  "resource": {
    "type": "summary",
    "id": "sum_..."
  },
  "occurred_at": "...",
  "sequence": 12345,
  "trace_id": "..."
}
```

Payloads are small. Large content is fetched through REST.

## Event Types

V1 realtime events:

- `source.health_changed`
- `scan.status_changed`
- `summary.ready`
- `summary.failed`
- `digest.status_changed`
- `notification.count_changed`
- `tenant.status_changed`

No raw source post stream in V1.

## Delivery Semantics

WebSocket delivery is:

- best effort
- ordered only within defined lanes if sequence is supported
- recoverable through REST
- not an audit mechanism

Client must tolerate:

- duplicate events
- missed events
- reconnect gaps
- unknown event types
- out-of-date events

## Cursor Recovery

Server may provide a per-subscription cursor/sequence.

On reconnect, client sends:

```text
last_seen_sequence
subscriptions[]
```

If replay window is unavailable, server responds with:

```text
requires_full_refresh = true
```

Client then reloads REST read models.

## Durable Replay Storage

Realtime replay events are stored behind `RealtimeEventRepositoryPort`.

MVP runtime supports two adapters:

- `InMemoryRealtimeEventRepository` for deterministic local smoke and single-process demos.
- `PrismaRealtimeEventRepository` when `DELIVERY_PERSISTENCE=prisma`, with unique `(tenantId, workspaceId, channel, sequence)` protection.

`RecordRealtimeEventUseCase` retries short sequence races reported by persistence. If a cursor is invalid or points beyond the latest persisted sequence, REST replay returns `resyncRequired=true` so the client refreshes REST read models instead of accepting a partial stream.

## Backpressure

If client is slow:

- drop low-priority events
- coalesce status events
- preserve terminal events where practical
- instruct client to refresh

Do not let a slow WebSocket client consume unbounded memory.

## AsyncAPI

Document WebSocket message shapes with AsyncAPI or an equivalent generated schema source.

Frontend generated types must be refreshed when event contracts change.

## Security

Every event fanout path checks:

- tenant membership
- subscription authorization
- resource visibility
- session validity

Never rely only on knowing a channel name.

## Architecture Rule

Realtime makes the UI fresh.

REST read models make the UI correct.
