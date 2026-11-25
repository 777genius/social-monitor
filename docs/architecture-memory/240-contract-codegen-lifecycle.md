# 240 - Contract Codegen Lifecycle

## Decision

API contracts are generated and versioned deliberately.

OpenAPI owns external REST contracts. Protobuf owns internal gRPC contracts. AsyncAPI/schema registry owns event contracts.

Generated clients are wrapped by application adapters and do not leak into domain layers.

## Sources

- OpenAPI Specification: https://spec.openapis.org/oas/
- OpenAPI Generator: https://openapi-generator.tech/docs/generators
- Protocol Buffers overview: https://protobuf.dev/overview/
- Protocol Buffers style guide: https://protobuf.dev/programming-guides/style/
- AsyncAPI: https://www.asyncapi.com/

## Generated Artifacts

Generate:

- Flutter REST client from OpenAPI
- TypeScript admin/public SDK from OpenAPI when needed
- TypeScript server DTO/types where safe
- gRPC clients/stubs from protobuf
- event schema types from schema registry/AsyncAPI

Do not manually maintain duplicate DTO definitions across backend and Flutter.

## Wrapper Rule

Generated client code is infrastructure.

Feature code depends on:

```text
ApiPort -> GeneratedClientAdapter -> generated client
```

This keeps:

- retries
- auth
- error mapping
- tracing
- pagination
- version compatibility

out of generated code.

## Protobuf Style

Follow official protobuf style:

- `lower_snake_case.proto`
- package names lower snake/dot delimited
- message names TitleCase
- field names snake_case
- enum values UPPER_SNAKE_CASE
- zero enum value with `_UNSPECIFIED` or `_UNKNOWN`

Never reuse field numbers.

## OpenAPI Style

OpenAPI specs must define:

- operation ids
- error response schemas
- pagination schemas
- auth/security schemes
- examples for important endpoints
- deprecation metadata
- stable enum behavior

Generated clients must be pinned to a generator version.

## Compatibility Rules

Safe:

- add optional response field
- add optional request field with default behavior
- add enum value only if clients have unknown handling
- add endpoint

Breaking:

- remove field
- rename field
- change field type
- change requiredness
- change error shape
- reuse protobuf tag

## CI Gates

CI must run:

- OpenAPI lint
- protobuf lint
- breaking-change detection
- generated-code freshness check
- Flutter client compile
- backend contract tests

PRs with stale generated code fail.

## Release Policy

Contracts are released before or with implementation.

Mobile clients need backward compatibility windows because old app versions remain in the wild.

Do not deploy server changes that require all mobile clients to update immediately.

## Architecture Rule

Generated code removes duplication. It does not remove the need for adapters, compatibility policy and contract tests.
