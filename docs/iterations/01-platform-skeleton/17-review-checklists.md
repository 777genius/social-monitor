# Iteration 01 - Review Checklists

## Backend Review

1. Domain code has no NestJS, ORM or broker imports.
2. Use cases depend on ports.
3. Adapters implement ports.
4. REST DTOs map into commands/view models.
5. Tenant context is required.

## Infrastructure Review

1. Local dependencies have health checks.
2. Migrations run from empty database.
3. Outbox and idempotency are not deferred.
4. OpenAPI generation is reproducible.

## Test Review

1. Architecture tests cover forbidden imports.
2. REST smoke covers topic creation.
3. Migration check runs in CI.
4. Duplicate command behavior is tested.
