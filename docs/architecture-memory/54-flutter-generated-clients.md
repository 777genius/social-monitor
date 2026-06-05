# Flutter Generated Clients & Data Mapping

Date: 2026-05-31
Status: baseline Flutter API client memory

## Decision

Generate REST clients from OpenAPI, but keep generated DTOs inside data/infrastructure layer.

Reference:

- OpenAPI Generator dart-dio: https://openapi-generator.tech/docs/generators/dart-dio/

## Data Flow

```text
Generated DTO
-> data mapper
-> application/domain model
-> presentation view model
-> widget
```

Forbidden:

```text
Generated DTO -> MobX Store -> Widget
Raw JSON -> Widget
HTTP route strings -> Widget
```

## Client Packages

Recommended:

```text
packages/api_client
packages/realtime_client
packages/core
packages/design_system
```

Feature data layer imports generated clients through repositories/adapters.

## Error Mapping

API errors use RFC 9457 Problem Details.

Flutter data layer maps:

```text
ProblemDetailsDto
-> ApplicationFailure
-> PresentationErrorViewModel
```

UI never branches on raw HTTP status strings alone.

## WebSocket/Reconnection

Realtime events are notifications/invalidation hints.

Client behavior:

- reconnect with backoff;
- resubscribe active tenant/topic channels;
- refetch REST truth after important events;
- do not assume missed WebSocket events are recoverable without REST/event replay.

## Locked Decisions

1. Generated DTOs stay in data layer.
2. DTOs are mapped before stores/widgets.
3. Problem Details are mapped to typed failures.
4. WebSocket events invalidate/refetch, not mutate durable truth directly.
5. Generated client build is a CI gate.

