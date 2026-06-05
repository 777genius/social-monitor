# Iteration 01 - Architecture Compliance Audit

## Audit Goal
Verify that the NestJS platform skeleton preserves Clean Architecture and can scale into modular microservices without premature coupling.

## Required Checks
- Domain code has no NestJS, ORM, broker, OpenAPI or infrastructure imports.
- Application services depend on ports, not adapters.
- Controllers translate HTTP DTOs into commands and queries only.
- Generated OpenAPI reflects real controller behavior.
- Outbox and idempotency are available before ingestion workers.

## Critical Violations
- Business rules live in controllers, providers or ORM entities.
- Shared libraries contain unrelated domain logic from multiple contexts.
- Events are emitted without version, tenant scope or idempotency key.
- Migration workflow cannot be repeated from clean and upgraded databases.

## SOLID And Clean Architecture Focus
- Single responsibility: modules should have one clear bounded-context purpose.
- Dependency inversion: adapters implement context ports used by feature/use-case slices and domain rules.
- Interface segregation: ports must be narrow and use-case oriented.

## Evidence Required
- Import-boundary checks.
- Build/test/lint output.
- Migration run evidence.
- OpenAPI generation artifact.
- Outbox duplicate-command test.

## Closure Rule
Iteration 02 cannot start if ingestion would need to bypass domain/application ports.
