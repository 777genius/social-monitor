# Iteration 01 - Phase Step Matrix

## Phase 01 - Monorepo Scaffold

### Build Steps

1. Create NestJS workspace.
2. Create apps for API gateway and workers.
3. Create domain/application/infrastructure libraries per bounded context.
4. Add strict TypeScript.
5. Add ESLint import boundary rules.
6. Add shared kernel.
7. Add unit test setup.
8. Add generated contract folder.

### Dependencies

- Iteration 00 architecture standards.

### Edge Cases

- Apps import infrastructure from another context.
- Shared kernel grows too large.
- Generated files are edited by hand.

### Validation

- Build passes.
- Boundary checks fail on forbidden imports.
- Domain packages have zero framework imports.

## Phase 02 - Local Infrastructure

### Build Steps

1. Add Docker Compose.
2. Add Postgres service.
3. Add Redis service.
4. Add Kafka service.
5. Add RabbitMQ service.
6. Add health checks.
7. Add `.env.example`.
8. Add local startup/reset scripts.

### Dependencies

- Monorepo commands.

### Edge Cases

- Broker reports ready before it is usable.
- Old Docker volumes contain stale state.
- Local reset deletes unexpected data.

### Validation

- Fresh checkout can start infra.
- Apps wait for dependencies cleanly.

## Phase 03 - Database Migrations

### Build Steps

1. Define migration tool.
2. Create base schema.
3. Add tenant-scoped tables.
4. Add scan/source tables.
5. Add summary/delivery tables.
6. Add indexes.
7. Add seed data.
8. Add migration CI test.

### Dependencies

- Data ownership map.

### Edge Cases

- Tenant id missing in unique constraints.
- Cursor JSON schema changes.
- Migration blocks running workers.

### Validation

- Empty DB migrates.
- Seed creates usable beta workspace.

## Phase 04 - API/Worker Bootstrap

### Build Steps

1. Add API gateway base module.
2. Add validation and error mapping.
3. Add OpenAPI generation.
4. Add worker process bootstrap.
5. Add graceful shutdown.
6. Add broker client adapters.
7. Add logging/tracing hooks.
8. Add smoke event flow.

### Dependencies

- Local infrastructure.
- Contracts library.

### Edge Cases

- Worker receives event before schema exists.
- Shutdown interrupts job mid-checkpoint.
- Request correlation id is lost in async event.

### Validation

- API and workers boot.
- Health endpoints work.
- Smoke flow emits and consumes event.

