# Iteration 01 - Definition Of Done

## Done Checklist

1. NestJS monorepo builds.
2. Backend apps exist.
3. Shared libs are separated by layer/context.
4. Local infrastructure boots.
5. Migrations run from empty database.
6. Outbox table exists.
7. Idempotency table exists.
8. Architecture tests exist.
9. Minimal REST topic flow works.
10. OpenAPI generation works.
11. Health checks exist.
12. Tenant context is enforced in baseline commands.

## Architecture Done

- Domain does not import NestJS, ORM or brokers.
- Use cases depend on ports.
- API DTOs are mapped, not passed as domain.
- Persistence adapters implement repository ports.

## Evidence Required

- Build output.
- Migration check.
- Architecture test output.
- OpenAPI artifact.
- Topic creation smoke result.

## Not Done If

- Topic can be created without tenant scope.
- OpenAPI is manually patched.
- Outbox/idempotency is deferred.
- Architecture rules are only documented but not testable.
