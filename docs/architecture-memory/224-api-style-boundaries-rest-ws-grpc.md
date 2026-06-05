# 224 - API Style Boundaries: REST, WS, gRPC

## Decision

External clients use REST plus WebSocket.

Internal service-to-service synchronous calls may use gRPC.

Asynchronous service integration is documented through events and AsyncAPI.

## Sources

- OpenAPI Specification: https://spec.openapis.org/oas/
- AsyncAPI Initiative: https://www.asyncapi.com/
- gRPC core concepts: https://grpc.io/docs/what-is-grpc/core-concepts/
- WebSocket RFC 6455: https://datatracker.ietf.org/doc/html/rfc6455

## External API Boundary

Frontend and public API consumers use REST for:

- auth/session flows
- tenant management
- topic CRUD
- source binding CRUD
- scan policy CRUD
- summaries/digests read models
- exports
- admin-safe operations

REST is documented with OpenAPI 3.1.x.

## WebSocket Boundary

WebSocket is used for server-to-client updates:

- scan status changed
- source credential health changed
- summary ready
- digest delivery status changed
- notification count changed
- tenant-visible incident/status update

WebSocket is not product truth. REST read models remain truth for hydration and recovery.

## Internal gRPC Boundary

Use gRPC for internal synchronous service calls where typed contracts and deadlines matter:

- summarization service request
- policy decision service call
- source capability lookup
- media/transcript service call
- tenant entitlement check if latency budget requires it

Every gRPC call needs:

- deadline
- retry policy or explicit no-retry decision
- auth/mTLS/workload identity
- correlation ids
- error mapping

## Event Boundary

Use events for state changes and durable workflows:

- source scan requested
- source item normalized
- cluster updated
- summary requested
- summary completed
- digest assembled
- notification requested
- webhook delivery attempted

Events are documented with AsyncAPI and schema registry.

## Avoiding Protocol Confusion

Do not expose gRPC directly to Flutter in V1.

Reasons:

- REST/OpenAPI client generation is simpler for mobile/web.
- WebSocket covers realtime UX needs.
- gRPC-web adds another edge translation layer before it is justified.

Do not use WebSocket for CRUD.

Do not use REST polling for high-frequency status streams when WebSocket is already connected.

## Versioning

REST:

- `/v1`
- additive changes preferred
- breaking changes require new version or deprecation window

WebSocket:

- protocol version in connection handshake
- typed envelope
- client can ignore unknown event types

gRPC:

- package versioning
- protobuf compatibility rules
- no field reuse

Events:

- schema id/version
- CloudEvents-style metadata where practical
- compatibility checks in CI

## Architecture Rule

Protocol choice follows boundary, not fashion:

```text
client command/query -> REST
client realtime signal -> WebSocket
internal typed request/reply -> gRPC
durable state change/workflow -> event
```
