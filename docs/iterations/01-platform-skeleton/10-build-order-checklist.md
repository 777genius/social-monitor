# Iteration 01 - Build Order Checklist

## Build Order

1. Scaffold NestJS monorepo.
2. Create backend apps.
3. Create shared libs by layer and context.
4. Add lint/typecheck/test scripts.
5. Add architecture boundary tests.
6. Add local PostgreSQL.
7. Add Kafka.
8. Add RabbitMQ if job dispatch is separated.
9. Add core migrations.
10. Add outbox table.
11. Add idempotency table.
12. Add base repository ports.
13. Add minimal REST commands.
14. Generate OpenAPI.
15. Add health checks.
16. Verify topic creation flow.

## Contracts First

- REST error shape.
- OpenAPI generation.
- Event envelope.
- Tenant context propagation.
- Repository port interfaces.

## Tests And Checks

- Monorepo build.
- Architecture dependency tests.
- Migration from empty database.
- REST contract generation.
- Duplicate command idempotency check.

## Edge Cases Before Closure

- Service starts before database.
- Duplicate topic creation request.
- Missing tenant context.
- Outbox event not published.
- Migration partially applies.

## Closure

Close only when local platform boots and a tenant-scoped topic can be created through REST.
