# 251 - NestJS Validation DTO Boundary

## Decision

NestJS request validation is global, strict and DTO-based at the API boundary.

DTOs are transport contracts. They are not domain entities, not persistence models and not application commands until explicitly mapped.

## Sources

- NestJS validation: https://docs.nestjs.com/techniques/validation
- NestJS pipes: https://docs.nestjs.com/pipes
- NestJS serialization: https://docs.nestjs.com/techniques/serialization
- class-validator: https://github.com/typestack/class-validator
- OWASP API Security Top 10: https://owasp.org/API-Security/

## Global Validation Pipe

Default API app configuration:

```text
whitelist = true
forbidNonWhitelisted = true
transform = true
forbidUnknownValues = true
```

Every exception to this policy needs an endpoint-level reason.

## DTO Role

DTOs define:

- HTTP request body shape
- query parameter shape
- path parameter shape
- OpenAPI documentation metadata
- validation constraints

DTOs must not contain:

- business invariants
- database decorators
- provider SDK response types
- domain behavior
- authorization decisions

## Mapping Boundary

Controller flow:

```text
validated DTO -> mapper -> application command/query -> use case
```

The mapper is where:

- strings become domain value objects
- IDs are parsed
- optional defaults are explicit
- transport enums map to domain enums

## Mass Assignment Protection

Never pass validated DTO directly into ORM create/update calls.

Reason: validation can make fields well-typed without making them safe to assign.

Use command-specific mapping that explicitly picks allowed fields.

## Query Parameters

Query DTOs must validate:

- cursor
- limit
- sort
- filters
- date ranges
- source type
- status

Default limits are applied in application layer, not hidden in repositories.

## Serialization

Response serialization is explicit.

Do not return ORM entities or provider payloads directly from controllers.

Response DTOs must exclude:

- source credentials
- raw provider payload
- internal error details
- support-only metadata
- deleted/legal-hold restricted data

## Testing

Required:

- unknown property rejection
- invalid type rejection
- max length rejection
- enum rejection
- nested DTO validation
- no mass-assignment regression
- OpenAPI schema matches DTO behavior

## Architecture Rule

Validation proves the transport shape is acceptable.

It does not prove the user is authorized or the command is valid in the domain.
