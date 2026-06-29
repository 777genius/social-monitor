# Frontend API Contract Playbook

## Purpose

This playbook keeps generated API usage predictable as backend contracts evolve.
Generated DTOs are outer-boundary details and must not enter application, domain, stores or widgets.

Related architecture memory:

- API lifecycle: `../../../docs/architecture-memory/15-api-lifecycle.md`
- API pagination: `../../../docs/architecture-memory/131-api-pagination-cursors.md`
- Problem Details: `../../../docs/architecture-memory/252-api-error-problem-details-contract.md`
- Contract codegen: `../../../docs/architecture-memory/240-contract-codegen-lifecycle.md`

## Generated Client Rule

Generated clients live in `packages/generated_api`.
Feature packages may import them only inside:

- `infrastructure/api`;
- `infrastructure/api_clients`;
- `infrastructure/data_sources`;
- `infrastructure/mappers`;
- `infrastructure/anti_corruption`.

Everything leaving infrastructure is translated into feature language.

## Selected Generator And Ownership

Default frontend REST generation is:

```text
OpenAPI snapshot
-> openapi_retrofit_generator
-> Retrofit declarations
-> Dio transport
-> packages/generated_api public facade
-> feature infrastructure anti-corruption adapters
-> application/domain contracts
```

`Dio`, `Retrofit`, `retrofit_generator` and `openapi_retrofit_generator` are implementation details of `packages/generated_api`.
Do not add them to `app`, `design_system`, `shared_kernel` or feature package pubspecs.
Do not import them from features, stores, widgets, use cases or domain code.

The app may configure generated API behavior only through package-owned facade objects, for example base URL, auth token provider, correlation id provider, timeout policy and redacted logging policy.
The app must not create feature-local `Dio` instances for REST calls.

`generated_api` is not a feature or business package.
It is allowed to aggregate generated transport declarations because OpenAPI generation is contract-wide, but it must not own product decisions, feature use-case interfaces, endpoint-specific mapping policy, UI state, provider copy or domain invariants.
Those belong to the bounded context that uses the endpoint.

Production frontend runtime config is app-owned and fail-closed.
The app may create `GeneratedApiRuntime` from compile-time Dart defines such as:

```text
SOCIAL_MONITOR_API_BASE_URL
SOCIAL_MONITOR_API_BEARER_TOKEN
SOCIAL_MONITOR_CORRELATION_ID
```

Features must not read these values directly.
If the app config is incomplete, production routes stay in unavailable states instead of showing demo data.

Generated files must live under a clearly generated path such as:

```text
packages/generated_api/lib/src/generated/
```

Regenerate the Flutter REST package only through the package-owned command:

```sh
npm run frontend:generate-api
```

The command reads `libs/contracts/rest/openapi.snapshot.json`, runs `openapi_retrofit_generator`, runs `build_runner`, then formats the package output.
Do not run generator commands inside feature packages.

Human-written code in `generated_api` owns only:

- package facade and exports;
- generated client factory/configuration;
- Problem Details/error mapping;
- typed transport exceptions;
- contract freshness tests.

Feature infrastructure owns endpoint-specific translation:

```text
application/contracts/TopicCatalog
<- infrastructure/api_clients/GeneratedTopicsApiClient
<- infrastructure/mappers/generated_topic_rest_mapper.dart
<- packages/generated_api
```

This keeps generator replacement possible. If `openapi_retrofit_generator` becomes a bad fit, replace it inside `packages/generated_api` and keep feature repository/use-case contracts stable.
Switching to another generator, including OpenAPI Generator `dart-dio` or `swagger_dart_code_generator`, requires an ADR, current package research, generated-api tests and architecture-test updates.

Endpoint addition rule:

1. Regenerate or extend `packages/generated_api` from the OpenAPI snapshot.
2. Add a feature-local infrastructure client or repository implementation for the specific endpoint family.
3. Map generated DTOs into feature DTOs, value objects or domain entities before returning to application code.
4. Keep the feature use case pointed at a narrow application/domain contract.
5. Add mapper/client tests in the feature and generated-api tests only for package-owned transport behavior.

## SOLID Guardrails

- SRP: generated API package owns transport/codegen; feature infrastructure owns mapping; application owns use-case orchestration; domain owns invariants.
- OCP: adding a backend endpoint adds generated API surface plus a feature adapter. It must not edit unrelated feature use cases.
- ISP: features depend on narrow repositories/gateways, not one app-wide API client interface.
- DIP: use cases depend on feature-owned abstractions. `Dio`, Retrofit clients and generated DTOs are low-level details.
- No God Package: `generated_api` can contain many generated endpoint declarations, but it cannot contain feature orchestration, shared business facades or generic service methods that mix bounded contexts.

Forbidden:

```text
presentation/store -> generated_api -> Dio
application/use_case -> generated_api
domain/model -> generated DTO
feature pubspec -> dio/retrofit/openapi_retrofit_generator
```

Allowed:

```text
presentation/store -> application/use_case -> domain/repository contract
infrastructure/repository implementation -> generated_api facade -> Dio/Retrofit
```

## Request Shape

Use typed command/query objects in application.

Examples:

```text
ListFeedMentionsQuery
CreateInterestCommand
ReconnectSourceCommand
LoadSummaryDetailQuery
```

Do not pass raw query maps, generated request DTOs or UI filter widgets into use cases.

## Pagination

Default shape:

- cursor-based;
- `limit` defaults to `PageRequest.defaultLimit`;
- `limit` is clamped to `PageRequest.maxLimit`;
- response maps to `PageResult<T>`;
- duplicate ids are removed or rejected at mapper/store boundary.

Offset pagination is allowed only for admin-like views where backend explicitly supports stable ordering.

## Filtering And Sorting

Filters are typed value objects, not ad hoc strings.

Rules:

- query object owns default values;
- unsupported filter values fail before API call;
- sort fields are enums with unknown fallback;
- user-entered text is passed as a field value, not interpolated into raw URLs;
- saved views store typed filter state, not raw query strings.

## Unknown Enums And Optional Fields

Mappers must handle:

- unknown enum values;
- missing optional fields;
- null fields where backend marks nullable;
- new fields ignored by older frontend;
- removed or renamed fields only through contract-version migration.

Unknown enum behavior must be explicit:

- map to `unknown` value object;
- show degraded/unsupported status;
- or fail with typed mapper failure.

Never silently treat unknown provider state as healthy.

## Problem Details And Errors

API failures map to shared or feature failures before presentation.

Required mapping:

- auth failure -> signed out or credential expired access state;
- permission failure -> permission required state with code;
- not found -> not-found route/entity state;
- validation failure -> field or form failure;
- rate limit/degraded backend -> retryable/degraded failure;
- unknown problem -> safe generic failure with trace id.

Do not show raw server messages without classification.

## Version Mismatch

When generated client and backend contract mismatch:

- mapper tests should fail first;
- app shows degraded/version-mismatch state if runtime detects incompatible schema;
- logs include version ids and correlation id, not raw payload;
- features must not hot-patch DTOs directly.

## Mapper Tests

Every mapper family needs tests for:

- success payload;
- missing optional field;
- unknown enum;
- problem/error payload;
- provider-specific field redaction if applicable.

Fixtures use fake values. No raw social posts, tokens, handles or provider payload dumps.

## Client Refresh Flow

When API contract changes:

1. Update backend contract and generation input.
2. Regenerate `packages/generated_api` through the documented generator command.
3. Update infrastructure mappers.
4. Update mapper/use-case tests.
5. Run generated-api tests, affected feature tests and frontend architecture gate.
