# 227 - NestJS Ports/Adapters DI Policy

## Decision

NestJS dependency injection is used as the composition mechanism, but domain and application layers depend on explicit ports, not concrete adapters.

Provider tokens are part of the application contract.

## Sources

- NestJS dependency injection: https://docs.nestjs.com/fundamentals/custom-providers
- NestJS providers: https://docs.nestjs.com/providers
- NestJS dynamic modules: https://docs.nestjs.com/fundamentals/dynamic-modules
- NestJS module reference: https://docs.nestjs.com/fundamentals/module-ref

## Port Token Style

Use stable symbol tokens:

```ts
export const SOURCE_ITEM_REPOSITORY = Symbol('SOURCE_ITEM_REPOSITORY');
export const SUMMARY_MODEL = Symbol('SUMMARY_MODEL');
export const CLOCK = Symbol('CLOCK');
```

Avoid raw string tokens except where framework integration requires them.

## Dependency Direction

```text
controller -> use case -> port interface -> adapter implementation
```

Forbidden:

```text
use case -> PrismaService
use case -> HttpService
use case -> Reddit SDK
domain -> Nest provider
```

## Module Pattern

Each bounded context has:

```text
Domain library
Application library
Infrastructure adapter library
Nest module for composition
```

Application module exports use cases and port tokens. Infrastructure module provides concrete bindings.

## Dynamic Modules

Use dynamic modules for environment-dependent adapters:

- model provider selection
- source provider registry
- storage backend
- broker backend
- feature-flag provider

Dynamic modules must not hide business logic. They only bind configuration and providers.

## Request Scope Policy

Default providers are singleton.

Request-scoped providers are allowed only for:

- request context
- auth principal
- correlation metadata
- transaction-scoped unit of work where justified

Do not make repositories or use cases request-scoped by default. It increases memory and complexity.

## Transaction Boundary

Use cases own transaction boundaries through a `UnitOfWorkPort`.

Controllers must not start database transactions.

Repositories must not silently start independent transactions for a larger use case.

## Testing

Use-case tests instantiate application services with fake ports, not Nest testing modules unless DI behavior is the subject under test.

Adapter tests use real or containerized dependencies.

Composition tests verify Nest modules bind every required port.

## Error Mapping

Adapters throw typed infrastructure errors or return typed results.

Use cases map them to application errors.

Controllers map application errors to REST/OpenAPI responses.

## Anti-Patterns

- injecting `ModuleRef` to bypass dependency design
- service locator usage inside domain/use cases
- making every module global
- leaking ORM types through port interfaces
- using SDK response DTOs as domain objects
- circular provider references with `forwardRef` as a default solution

## Architecture Rule

NestJS is the wiring layer. Clean Architecture owns dependency direction.
