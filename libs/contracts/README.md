# Contracts

Generated and hand-authored contract definitions live here:

- `rest` - REST/OpenAPI DTOs and generated OpenAPI artifacts.
- `events` - versioned event envelopes and payload schemas.
- `grpc` - internal proto files only when synchronous service calls are justified.

Contracts are allowed to know transport shape. Domain and feature slices are not.

Run `npm run update:openapi` after an intentional REST contract change and review `rest/openapi.snapshot.json`.
Run `npm run check:openapi` in CI/local verification to block unreviewed OpenAPI drift.
