# 92. Data Contract Examples

## Status

Locked for architecture baseline.

## Research Anchors

- JSON Schema specification: https://json-schema.org/specification
- CloudEvents specification: https://github.com/cloudevents/spec
- OpenAPI Specification: https://spec.openapis.org/oas/latest.html

## Decision

Use explicit contracts at every boundary:

- REST API: OpenAPI 3.1 and JSON Schema 2020-12.
- Events: CloudEvents envelope plus registered data schemas.
- Internal RPC: Protobuf for gRPC.
- AI outputs: JSON Schema / structured outputs matching application DTOs.

## Canonical Normalized Item Event

```json
{
  "specversion": "1.0",
  "type": "social.item.normalized.v1",
  "source": "ingestion.reddit",
  "id": "evt_01j...",
  "time": "2026-05-31T12:00:00Z",
  "datacontenttype": "application/json",
  "dataschema": "schema://social.item.normalized/1.0.0",
  "subject": "tenant/ten_123/source/reddit/item/t3_abc",
  "data": {
    "tenantId": "ten_123",
    "sourceKind": "reddit",
    "sourceItemId": "t3_abc",
    "canonicalUrl": "https://www.reddit.com/r/example/comments/abc/title/",
    "authorRef": "reddit:user:hash",
    "publishedAt": "2026-05-31T11:58:00Z",
    "language": "en",
    "title": "Example title",
    "bodyTextRef": "s3://raw-normalized/...",
    "metrics": {
      "score": 120,
      "comments": 18
    },
    "rawPayloadRef": "s3://raw-payloads/..."
  }
}
```

## Compatibility Rules

For event data schemas:

- Add optional fields only for backward-compatible changes.
- Never change meaning of an existing field.
- Never reuse enum values for different semantics.
- Removing fields, changing required fields, or changing type requires a new major schema version.
- Consumers must ignore unknown fields.

For REST:

- Public response fields can be added in minor releases.
- Removing/renaming fields requires a new API version or formal deprecation window.
- Error shape is stable and shared across services.

For gRPC:

- Never reuse Protobuf field numbers.
- Reserve removed field names and numbers.
- Prefer adding new fields over changing existing message semantics.

## Schema Ownership

Each schema has one owner service and one business owner. Platform may operate the registry, but platform does not own the semantics of source, topic, summary or billing contracts.

## Best-Fact Choice

CloudEvents gives a stable envelope for async interop; JSON Schema 2020-12 aligns with OpenAPI 3.1; Protobuf remains better for typed internal RPC. Mixing all three is correct because they serve different boundaries.

