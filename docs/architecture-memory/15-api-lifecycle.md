# API Lifecycle & External Integration Standards

Date: 2026-05-31
Status: baseline API lifecycle memory

## Decision

Public and frontend-facing APIs must be boring, standards-based and recoverable.

Use:

- OpenAPI 3.1 for REST contracts;
- RFC 9457 Problem Details for errors;
- RFC 9110 HTTP semantics;
- RFC 8288 Web Linking where link headers help;
- RFC 8594 Sunset headers for endpoint removal timelines;
- cursor pagination for large mutable collections.

References:

- RFC 9110 HTTP Semantics: https://www.rfc-editor.org/rfc/rfc9110
- RFC 8288 Web Linking: https://www.rfc-editor.org/info/rfc8288
- RFC 8594 Sunset: https://www.rfc-editor.org/rfc/rfc8594
- RFC 9457 Problem Details: https://www.rfc-editor.org/rfc/rfc9457

## Pagination

Use cursor pagination for:

```text
feed items
scan runs
connector runs
summaries
digests
audit log
cost ledger
external event log
webhook deliveries
```

Cursor is opaque to clients.

Response shape:

```json
{
  "items": [],
  "next_cursor": "...",
  "previous_cursor": "...",
  "has_more": true
}
```

No offset pagination for large mutable collections.

## Idempotent Commands

Unsafe retryable commands require `Idempotency-Key`:

- create topic;
- create source binding;
- trigger scan;
- retry scan;
- generate summary preview;
- send digest;
- create connector credential;
- start backfill;
- approve replay.

Behavior:

- same key + same payload: return original result;
- same key + different payload: 422;
- same key while processing: 409;
- missing key for required operation: 400.

## Deprecation

Deprecated endpoints must include:

- `Deprecation` header where supported by clients/tooling;
- `Sunset` header for removal date;
- `Link` to migration docs where useful;
- usage metrics;
- owner;
- migration guide.

No silent endpoint/event/schema removal.

## Realtime

WebSocket events are invalidation hints, not durable truth.

Frontend receives:

```text
scan.run.completed
summary.created
digest.created
quota.warning
```

Then it refetches authoritative REST queries.

## External Event Replay

Webhook delivery alone is not enough.

Expose replayable APIs for external integrations:

```text
GET /v1/events?cursor=...
GET /v1/events/{eventId}
POST /v1/webhook-endpoints/{id}:replay
```

Webhook is push notification. Events API is recovery path.

## Locked Decisions

1. REST follows standard HTTP semantics.
2. Large mutable collections use cursor pagination.
3. Unsafe retryable commands use idempotency keys.
4. WebSocket events are invalidation hints, not truth.
5. External integrations need event replay APIs.
6. No silent API or event deprecations.

