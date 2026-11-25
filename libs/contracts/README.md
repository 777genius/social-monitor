# Contracts

Generated and hand-authored contract definitions live here:

- `rest` - REST/OpenAPI DTOs and generated OpenAPI artifacts.
- `events` - versioned event envelopes and payload schemas.
- `grpc` - internal proto files only when synchronous service calls are justified.
- `social-research` - transport-neutral tool/input contract for SDK, MCP and
  future generated language clients.

Contracts are allowed to know transport shape. Domain and feature slices are not.

Run `npm run update:openapi` after an intentional REST contract change and review `rest/openapi.snapshot.json`.
Run `npm run check:openapi` in CI/local verification to block unreviewed OpenAPI drift.
Run `npm run check:events` after adding or changing event producers so `events/event-catalog.json` stays compatible with emitted event envelopes.
Run `npm run check:social-research-contract` after changing social research
tool schemas or SDK request helpers so `social-research/social-research.contract.json`
`social-research/social-research.sdk-cases.json` and
`social-research/social-research.sdk-conformance.json` stay in sync with the
SDK source of truth.
Run `npm run check:social-research-sdk-conformance` after changing social
research SDK operations, tool definitions, REST/gRPC shapes or MCP adapters so
transport parity remains executable.
