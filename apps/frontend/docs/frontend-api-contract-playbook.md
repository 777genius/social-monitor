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

## Request Shape

Use typed command/query objects in application.

Examples:

```text
ListFeedMentionsQuery
CreateTopicCommand
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
2. Regenerate `packages/generated_api`.
3. Update infrastructure mappers.
4. Update mapper/use-case tests.
5. Run generated-api tests, affected feature tests and frontend architecture gate.

