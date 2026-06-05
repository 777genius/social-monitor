# Contracts

Generated and hand-authored contract definitions live here:

- `rest` - REST/OpenAPI DTOs and generated OpenAPI artifacts.
- `events` - versioned event envelopes and payload schemas.
- `grpc` - internal proto files only when synchronous service calls are justified.

Contracts are allowed to know transport shape. Domain and feature slices are not.
