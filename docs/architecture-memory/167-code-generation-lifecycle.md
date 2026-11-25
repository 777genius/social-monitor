# 167. Code Generation Lifecycle

## Status

Locked for contract/tooling baseline.

## Research Anchors

- OpenAPI Generator: https://openapi-generator.tech/docs/usage
- Buf breaking change detection: https://buf.build/docs/breaking/
- Buf configuration: https://buf.build/docs/configuration/v2/buf-yaml/

## Decision

Generated code is reproducible build output with clear ownership. Contracts are edited; generated files are regenerated and checked for freshness.

## Generated Artifacts

| Contract | Generated Output |
|---|---|
| OpenAPI | Flutter REST client, TypeScript client, API docs |
| Protobuf | gRPC server/client stubs |
| Event schemas | typed event producers/consumers, validators |
| MobX annotations | store generated code |
| Prisma schema | client/types/migrations |

## Rules

- Generated files include tool/version marker.
- CI fails if generated output is stale.
- Breaking checks run before merge.
- Generated code is not manually edited.
- Contract changes include changelog and migration notes.
- Tool versions are pinned in workspace/tool config.

## Protobuf

Use Buf for lint/breaking checks. Removed fields are reserved; field numbers are never reused.

## Best-Fact Choice

Codegen reduces drift only when freshness and breaking checks are enforced. Otherwise generated clients become another stale artifact.

