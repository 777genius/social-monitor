# Flutter Generated Clients & Data Mapping

Date: 2026-05-31
Status: baseline Flutter API client memory
Updated: 2026-06-23 - selected `openapi_retrofit_generator` with `Dio`/`Retrofit` inside `apps/frontend/packages/generated_api`

## Decision

Generate REST clients from OpenAPI, but keep generated DTOs and transport details inside the frontend generated-api boundary.

Reference:

- openapi_retrofit_generator: https://pub.dev/packages/openapi_retrofit_generator
- Dio: https://pub.dev/packages/dio
- Retrofit: https://pub.dev/packages/retrofit
- OpenAPI Generator dart-dio fallback: https://openapi-generator.tech/docs/generators/dart-dio/

Default choice:

```text
OpenAPI snapshot
-> openapi_retrofit_generator
-> Retrofit declarations
-> Dio transport
-> apps/frontend/packages/generated_api
```

`Dio`, `Retrofit`, `retrofit_generator` and `openapi_retrofit_generator` are implementation details of `packages/generated_api`.
App and feature packages do not depend on or import them directly.

`packages/generated_api` is a contract and transport boundary, not a business abstraction.
OpenAPI generation is intentionally contract-wide, so the package can expose many generated endpoint declarations.
Feature ownership still stays local: each bounded context owns its application contract, infrastructure adapter, anti-corruption mapper, failures and mapper tests for the endpoint family it consumes.

## Data Flow

```text
Generated DTO
-> feature infrastructure mapper
-> application/domain model
-> presentation view model
-> widget
```

Forbidden:

```text
Generated DTO -> MobX Store -> Widget
Raw JSON -> Widget
HTTP route strings -> Widget
Dio/Retrofit -> Feature Use Case
Dio/Retrofit -> Feature Store
```

## Client Packages

Frontend packages:

```text
apps/frontend/packages/generated_api
apps/frontend/packages/shared_kernel
apps/frontend/packages/design_system
apps/frontend/features/<bounded_context>
```

Feature infrastructure imports `social_monitor_generated_api` through anti-corruption adapters, mappers, api clients or data sources.
Domain, application, presentation stores and widgets do not import generated API clients or DTOs.

Endpoint flow:

```text
feature use case
-> feature-owned application/domain contract
-> feature infrastructure adapter
-> feature mapper/anti-corruption layer
-> packages/generated_api facade
-> Dio/Retrofit generated transport
```

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
6. `openapi_retrofit_generator` plus `Dio`/`Retrofit` is the default Flutter REST generation strategy.
7. Generator replacement requires ADR, current package research, generated-api tests and frontend architecture-test updates.
